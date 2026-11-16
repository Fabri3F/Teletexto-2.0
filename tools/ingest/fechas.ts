// Comprobaciones de fechas que el esquema JSON no puede hacer: que el día exista en el calendario.
// El patrón de `comun.schema.json` solo rechaza meses, días, horas y minutos fuera de rango.

const FECHA_HORA_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
const FECHA_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasEnMes(anio: number, mes: number): number {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function existeElDia(anio: number, mes: number, dia: number): boolean {
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasEnMes(anio, mes);
}

/** Verdadero si el texto es una fecha y hora UTC ISO 8601 con sufijo Z que existe en el calendario. */
export function esFechaHoraUtcReal(texto: string): boolean {
  const m = FECHA_HORA_UTC.exec(texto);
  if (!m) return false;
  const [anio, mes, dia, hora, minuto, segundo] = m.slice(1).map(Number);
  if (
    anio === undefined ||
    mes === undefined ||
    dia === undefined ||
    hora === undefined ||
    minuto === undefined ||
    segundo === undefined
  ) {
    return false;
  }
  return existeElDia(anio, mes, dia) && hora <= 23 && minuto <= 59 && segundo <= 59;
}

/** Verdadero si el texto es una fecha AAAA-MM-DD que existe en el calendario. */
export function esFechaCalendarioReal(texto: string): boolean {
  const m = FECHA_CALENDARIO.exec(texto);
  if (!m) return false;
  const [anio, mes, dia] = m.slice(1).map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) return false;
  return existeElDia(anio, mes, dia);
}

/** Instante en milisegundos de una fecha y hora UTC ya comprobada con `esFechaHoraUtcReal`. */
export function instanteUtc(texto: string): number {
  return Date.parse(texto);
}
