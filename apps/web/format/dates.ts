// Formato de fechas del cliente (tarea 4.1). Requisitos 1.7, 1.8, 9.2 y 9.3.
//
// Las fechas viajan en UTC ISO 8601 y la hora de Perú (UTC-5, sin horario de verano) se calcula solo aquí, en el cliente.
// Todo es aritmética sobre campos UTC: no se usa `Intl`, ni `toLocale*`, ni la zona horaria del dispositivo.
// Ninguna función de este módulo lee el reloj. El reloj se inyecta como `Ahora` en quien lo necesita.

/** Reloj inyectable: devuelve el instante actual en milisegundos desde 1970-01-01T00:00:00Z. */
export type Ahora = () => number;

/** Reloj del dispositivo. Es la única lectura de `Date.now()` de este módulo y solo se usa si alguien la pide. */
export const ahoraDelSistema: Ahora = () => Date.now();

/** Texto que se muestra cuando una fecha falta o no es válida (Requisito 9.3). */
export const NO_DISPONIBLE = 'No disponible';

/** Desfase fijo de Perú respecto de UTC: UTC-5, sin horario de verano. */
const DESFASE_PERU_MS = -5 * 60 * 60 * 1000;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Fecha y hora UTC ISO 8601 con sufijo Z y de 1 a 3 decimales de segundo opcionales, igual que el esquema `fechaHoraUtc`. */
const FECHA_HORA_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasEnMes(anio: number, mes: number): number {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** Días desde 1970-01-01 hasta el día civil dado (calendario gregoriano). Aritmética pura: sirve también para los años 0 a 99. */
function diasDesdeEpoca(anio: number, mes: number, dia: number): number {
  const a = mes <= 2 ? anio - 1 : anio;
  const era = Math.floor(a / 400);
  const anioDeEra = a - era * 400;
  const diaDelAnio = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const diaDeEra = anioDeEra * 365 + Math.floor(anioDeEra / 4) - Math.floor(anioDeEra / 100) + diaDelAnio;
  return era * 146097 + diaDeEra - 719468;
}

/**
 * Instante en milisegundos de una fecha y hora UTC ISO 8601 terminada en Z (con milisegundos opcionales), o `undefined`
 * si el valor no es un texto, no tiene esa forma o el día no existe en el calendario. No acepta desfases horarios
 * (`-05:00`), fechas sin hora ni textos libres.
 */
export function instanteDeIso(iso: unknown): number | undefined {
  if (typeof iso !== 'string') return undefined;
  const m = FECHA_HORA_UTC.exec(iso);
  if (m === null) return undefined;
  const [anio, mes, dia, hora, minuto, segundo] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasEnMes(anio, mes) || hora > 23 || minuto > 59 || segundo > 59) return undefined;
  const milisegundos = Number((m[7] ?? '0').padEnd(3, '0'));
  return diasDesdeEpoca(anio, mes, dia) * MS_POR_DIA + ((hora * 60 + minuto) * 60 + segundo) * 1000 + milisegundos;
}

const dos = (n: number): string => String(n).padStart(2, '0');

/** Campos de la hora de Perú de un instante. `undefined` si el instante no es finito o el año no cabe en cuatro dígitos. */
function camposDePeru(epochMs: unknown): { fecha: string; hora: string; minuto: string; segundo: string } | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return undefined;
  // Se trunca al segundo: el reloj nunca muestra un segundo que todavía no empezó.
  const instante = new Date(Math.floor(epochMs / 1000) * 1000 + DESFASE_PERU_MS);
  const anio = instante.getUTCFullYear();
  if (!Number.isInteger(anio) || anio < 0 || anio > 9999) return undefined; // NaN si el instante excede el rango de Date
  return {
    fecha: `${dos(instante.getUTCDate())}/${dos(instante.getUTCMonth() + 1)}/${String(anio).padStart(4, '0')}`,
    hora: dos(instante.getUTCHours()),
    minuto: dos(instante.getUTCMinutes()),
    segundo: dos(instante.getUTCSeconds()),
  };
}

/**
 * Fecha y hora de Perú en formato `DD/MM/AAAA HH:mm` (reloj de 24 horas) de una fecha UTC ISO 8601 terminada en Z.
 * Devuelve "No disponible" si el valor está vacío, no es una fecha válida o el resultado queda fuera de los años 0000 a 9999.
 */
export function formatLima(iso: string | null | undefined): string {
  const campos = camposDePeru(instanteDeIso(iso));
  return campos === undefined ? NO_DISPONIBLE : `${campos.fecha} ${campos.hora}:${campos.minuto}`;
}

/**
 * Fecha y hora de Perú en formato `DD/MM/AAAA HH:mm:ss` (reloj de 24 horas) de un instante en milisegundos. Es lo que
 * muestra el reloj de la Portada. Trunca los milisegundos. Devuelve "No disponible" si el instante no es un número finito
 * o el resultado queda fuera de los años 0000 a 9999.
 */
export function formatLimaConSegundos(epochMs: number): string {
  const campos = camposDePeru(epochMs);
  return campos === undefined ? NO_DISPONIBLE : `${campos.fecha} ${campos.hora}:${campos.minuto}:${campos.segundo}`;
}
