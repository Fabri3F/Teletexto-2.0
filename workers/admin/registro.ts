// Registro de rechazos del Worker de administración (tarea 14.2, Requisito 15.10).
//
// Cada rechazo (401 o 403) produce UNA línea JSON con: fecha y hora UTC con segundos, IP validada, recurso sin cadena de consulta,
// estado, motivo y método. Nada de lo que escribe el cliente llega al registro sin pasar por una lista cerrada o por una limpieza:
//   - el motivo es un código de una lista cerrada, nunca texto del cliente;
//   - el método se limita a una lista corta;
//   - la IP solo se acepta si es una IPv4 o una IPv6 válida; si no, se escribe un marcador fijo;
//   - el recurso es solo la ruta, se limpia a ASCII imprimible y se recorta.
// Nunca se registran el token, la cabecera Authorization ni ningún secreto: esta función no recibe esos datos.

/** Motivos de rechazo. Lista cerrada: es lo único que puede aparecer en el campo `motivo`. */
export const MOTIVOS_RECHAZO = [
  'sin_credencial',
  'esquema_invalido',
  'token_demasiado_grande',
  'token_malformado',
  'algoritmo_no_permitido',
  'firma_invalida',
  'expirado',
  'aun_no_valido',
  'claims_invalidos',
  'rol_insuficiente',
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

/** Estados con los que el Worker rechaza una credencial. */
export type EstadoRechazo = 401 | 403;

/** Valor que se escribe cuando un dato no está disponible o no es válido. Es el mismo texto del resto del proyecto. */
export const NO_DISPONIBLE = 'No disponible';
/** Longitud máxima del recurso registrado. */
export const MAX_CARACTERES_RECURSO = 200;

/** Métodos HTTP que se registran tal cual. Cualquier otro se registra como `OTRO`. */
const METODOS_CONOCIDOS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export interface RegistroRechazo {
  readonly evento: 'admin_rechazo';
  /** `AAAA-MM-DDTHH:mm:ssZ` en UTC, o "No disponible" si el reloj no da una fecha válida. */
  readonly timestamp: string;
  readonly ip: string;
  readonly recurso: string;
  readonly estado: EstadoRechazo;
  readonly motivo: MotivoRechazo;
  readonly metodo: string;
}

export interface DatosRechazo {
  /** Instante actual en milisegundos desde 1970 (reloj inyectado). */
  readonly ahoraMs: number;
  /** Valor crudo de `CF-Connecting-IP`, o `null` si no vino. */
  readonly ip: string | null;
  /** Ruta de la solicitud (`pathname`), sin cadena de consulta. */
  readonly ruta: string;
  readonly metodo: string;
  readonly estado: EstadoRechazo;
  readonly motivo: MotivoRechazo;
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const CARACTERES_IPV6 = /^[0-9A-Fa-f:.]+$/;

/**
 * Devuelve la IP si es una IPv4 en notación decimal estricta o una IPv6 válida; en cualquier otro caso devuelve "No disponible".
 * No usa X-Forwarded-For ni otras cabeceras: quien llama pasa solo `CF-Connecting-IP`.
 */
export function validarIp(valor: string | null): string {
  if (typeof valor !== 'string') return NO_DISPONIBLE;
  if (valor.length === 0 || valor.length > 45) return NO_DISPONIBLE;
  if (IPV4.test(valor)) return valor;
  if (!valor.includes(':') || !CARACTERES_IPV6.test(valor)) return NO_DISPONIBLE;
  try {
    // El analizador de URL aplica las reglas estrictas de IPv6 y devuelve la forma normalizada.
    const { hostname } = new URL(`http://[${valor}]/`);
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : NO_DISPONIBLE;
  } catch {
    return NO_DISPONIBLE;
  }
}

/** Fecha y hora UTC con precisión de segundos, o "No disponible" si el valor no es una fecha válida. */
export function formatearFechaUtc(ahoraMs: number): string {
  if (!Number.isFinite(ahoraMs)) return NO_DISPONIBLE;
  const fecha = new Date(ahoraMs);
  if (Number.isNaN(fecha.getTime())) return NO_DISPONIBLE;
  return `${fecha.toISOString().slice(0, 19)}Z`;
}

/** Deja solo ASCII imprimible (los demás caracteres pasan a `?`) y recorta. Así no hay saltos de línea ni códigos de control. */
export function limpiarRecurso(ruta: string): string {
  const ascii = String(ruta).replace(/[^\x20-\x7e]/g, '?');
  return ascii.slice(0, MAX_CARACTERES_RECURSO);
}

/** Método HTTP en mayúsculas si está en la lista corta; `OTRO` si no. */
export function limpiarMetodo(metodo: string): string {
  const mayusculas = String(metodo).toUpperCase();
  return METODOS_CONOCIDOS.has(mayusculas) ? mayusculas : 'OTRO';
}

/** Arma el registro de un rechazo con todos los datos ya validados o limpiados. */
export function construirRegistro(datos: DatosRechazo): RegistroRechazo {
  return {
    evento: 'admin_rechazo',
    timestamp: formatearFechaUtc(datos.ahoraMs),
    ip: validarIp(datos.ip),
    recurso: limpiarRecurso(datos.ruta),
    estado: datos.estado,
    motivo: datos.motivo,
    metodo: limpiarMetodo(datos.metodo),
  };
}

/** Una sola línea JSON. `JSON.stringify` escapa comillas y barras; la limpieza anterior ya quitó los caracteres de control. */
export function serializarRegistro(registro: RegistroRechazo): string {
  return JSON.stringify(registro);
}
