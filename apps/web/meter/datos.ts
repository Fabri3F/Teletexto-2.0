// Indicador de datos del cliente: lógica pura (tarea 5.11). Requisitos 8.2 a 8.9, 8.11, 8.12 y 8.15.
//
// Este módulo no usa APIs del navegador: no lee la red, el reloj ni el almacenamiento, y no hace solicitudes propias.
// El estado vive solo en memoria y lo guarda quien llama. Solo suma bytes medidos de verdad. No estima ni simula valores.
// La lectura de Resource Timing y de los mensajes del service worker es del adaptador (tarea 8.5).

/** Texto que se muestra cuando un valor no se puede medir (Requisitos 8.6 y 8.7). */
export const NO_DISPONIBLE = 'No disponible';
/** Título del indicador (Requisito 8.1). */
export const TITULO_INDICADOR = 'Datos usados por esta aplicación en esta sesión';
/** Aviso de alcance (Requisito 8.9). */
export const AVISO_ALCANCE = 'No incluye otras aplicaciones ni el consumo total de Internet del dispositivo';
/** Aviso cuando el navegador no mide todo (Requisito 8.6). */
export const AVISO_SOLO_LO_MEDIBLE = 'Solo se muestra lo que el navegador puede medir';
/** Aviso del margen de error de la medición (design.md, sección Indicador_de_Datos). */
export const AVISO_MARGEN_DE_ERROR = 'Medido a partir de las respuestas de la aplicación; puede diferir del consumo real de red';

const BYTES_POR_CENTESIMA = 10_000; // 1 MB = 1 000 000 bytes, y 0.01 MB = 10 000 bytes
const PUNTO_MEDIO = 5_000;

/** Bytes acumulados en la sesión. Enteros seguros no negativos. `enviados` falta si nunca se midió. */
export interface EstadoDatos {
  readonly descargados: number;
  readonly enviados?: number;
}
/** Bytes medidos de una solicitud. Un campo ausente o inválido no suma nada. */
export interface MuestraBytes {
  readonly descargados?: number;
  readonly enviados?: number;
}
/** Lo que el navegador permite medir. Si no se sabe, se pasa `false`. */
export interface CapacidadesMedicion {
  readonly descargas: boolean;
  readonly envios: boolean;
}

/** Estado al iniciar la sesión: 0 bytes (Requisito 8.11). */
export const estadoInicialDatos: EstadoDatos = Object.freeze({ descargados: 0 });

function esMedido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0;
}

/** Suma `valor` a `base` si es un byte medido y el total sigue siendo un entero seguro. Si no, devuelve `base`. */
function sumar(base: number, valor: unknown): number {
  if (!esMedido(valor) || valor > Number.MAX_SAFE_INTEGER - base) return base;
  return base + valor;
}

/**
 * Suma solo los bytes medidos de la muestra (Requisitos 8.2, 8.8 y 8.15). Se ignoran cero, negativos, decimales, valores no
 * finitos, no números y campos ausentes. Una solicitud fallida o cancelada sin bytes medidos no cambia el total. Si una suma
 * superara `Number.MAX_SAFE_INTEGER`, esa parte se ignora. No modifica el estado recibido. Devuelve el mismo objeto si
 * nada cambia; si cambia, devuelve un estado nuevo congelado.
 */
export function acumular(estado: EstadoDatos, muestra: MuestraBytes): EstadoDatos {
  if (typeof muestra !== 'object' || muestra === null) return estado;
  const descargados = sumar(estado.descargados, muestra.descargados);
  const enviadosPrevios = estado.enviados ?? 0;
  const enviados = sumar(enviadosPrevios, muestra.enviados);
  const cambioDescargados = descargados !== estado.descargados;
  const cambioEnviados = enviados !== enviadosPrevios;
  if (!cambioDescargados && !cambioEnviados) return estado;
  const siguiente: EstadoDatos = cambioEnviados || estado.enviados !== undefined ? { descargados, enviados } : { descargados };
  return Object.freeze(siguiente);
}

/**
 * Megabytes con exactamente dos decimales (Requisito 8.3): 1 MB = 1 000 000 bytes, se redondea al múltiplo de 0.01 MB más
 * cercano y el punto medio sube. Solo usa aritmética entera. Devuelve "No disponible" si `bytes` no es un entero seguro no
 * negativo, para no mostrar un número que no se midió.
 */
export function formatMB(bytes: number): string {
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) return NO_DISPONIBLE;
  const resto = bytes % BYTES_POR_CENTESIMA;
  const centesimas = (bytes - resto) / BYTES_POR_CENTESIMA + (resto >= PUNTO_MEDIO ? 1 : 0);
  const centesimasResto = centesimas % 100;
  const enteros = (centesimas - centesimasResto) / 100;
  return `${enteros}.${String(centesimasResto).padStart(2, '0')} MB`;
}

/**
 * Líneas del indicador según lo que el navegador puede medir (Requisitos 8.1, 8.4 a 8.9 y 8.11).
 * - Ambas mediciones: "Descargados" y "Enviados", en MB.
 * - Solo descargas: "Enviados: No disponible" y el aviso de que solo se muestra lo medible.
 * - Solo envíos: "Descargados: No disponible" y el mismo aviso.
 * - Ninguna: "No disponible" sin ningún valor numérico.
 * Un valor que no se puede medir nunca se muestra, aunque el estado tenga un número.
 * En todos los casos, después de los valores y de los avisos de lo medible, se añade el aviso de margen de error y, al
 * final, el aviso de alcance.
 */
export function textoIndicador(estado: EstadoDatos, capacidades: CapacidadesMedicion): string[] {
  const descargas = capacidades.descargas === true;
  const envios = capacidades.envios === true;
  const lineas: string[] = [TITULO_INDICADOR];
  if (!descargas && !envios) {
    lineas.push(NO_DISPONIBLE);
  } else {
    lineas.push(`Descargados: ${descargas ? formatMB(estado.descargados) : NO_DISPONIBLE}`);
    lineas.push(`Enviados: ${envios ? formatMB(estado.enviados ?? 0) : NO_DISPONIBLE}`);
  }
  if (!descargas || !envios) lineas.push(AVISO_SOLO_LO_MEDIBLE);
  lineas.push(AVISO_MARGEN_DE_ERROR);
  lineas.push(AVISO_ALCANCE);
  return lineas;
}
