// Configuración de la fuente de la geometría del mapa y puerta de confirmación del Equipo (tarea 3.1).
//
// `tools/geo` no corre mientras `confirmadoPorEquipo` no sea exactamente `true` en
// `fuente.config.json` (steering `tech.md`, "Limitaciones conocidas"). Este módulo es puro: no lee
// archivos ni imprime nada. Lo usan `cli.ts` y, desde la tarea 3.2, la generación de la geometría.

import type { Geometria } from '@teletexto/modelo';

/** Campos de `fuente.config.json` que usa el código, una vez confirmada la fuente. */
export interface FuenteConfig {
  confirmadoPorEquipo: true;
  fuente: {
    publicador: string;
    conjunto: string;
    identificador: string;
    /** "referencial": los límites no son límites legales definitivos. */
    naturalezaDeLosLimites: string;
    /** Fuente que indican los atributos del archivo (en este conjunto, el campo FUENTE del DBF). */
    fuenteEnAtributos: { campo: string; valor: string };
  };
  licencia: { id: string; nombre: string; version: string; urlTexto: string };
  atribucion: { texto: string };
  sistemaCoordenadas: { nombre: string };
  codificacion: { esquema: string; unidades: number; primerCodigo: string; ultimoCodigo: string; callao: string };
  archivoLocal: { ruta: string; sha256: string; bytes: number };
}

/** Resultado de la puerta: o se puede continuar con una configuración completa, o se rechaza con el motivo. */
export type Puerta =
  | { permitido: true; config: FuenteConfig; resumen: string[] }
  | { permitido: false; motivo: string; errores: string[]; resumen: string[] };

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

function en(valor: unknown, ...ruta: string[]): unknown {
  let actual: unknown = valor;
  for (const clave of ruta) {
    if (!esObjeto(actual)) return undefined;
    actual = actual[clave];
  }
  return actual;
}

function texto(valor: unknown, ...ruta: string[]): string | undefined {
  const dato = en(valor, ...ruta);
  return typeof dato === 'string' && dato.trim() !== '' ? dato : undefined;
}

const NO_INDICADO = '(no indicado)';

/**
 * Resumen legible de la fuente, la licencia y la codificación. Se imprime antes de rechazar una
 * fuente sin confirmar, para que el Equipo vea qué debe confirmar. Tolera configuraciones incompletas.
 */
export function resumirFuente(config: unknown): string[] {
  const dato = (...ruta: string[]): string => texto(config, ...ruta) ?? NO_INDICADO;
  const unidades = en(config, 'codificacion', 'unidades');
  return [
    `Fuente: ${dato('fuente', 'publicador')}`,
    `Conjunto de datos: ${dato('fuente', 'conjunto')} (identificador ${dato('fuente', 'identificador')})`,
    `Naturaleza de los límites: ${dato('fuente', 'naturalezaDeLosLimites')}`,
    `Fuente indicada en los atributos (${dato('fuente', 'fuenteEnAtributos', 'campo')}): ${dato('fuente', 'fuenteEnAtributos', 'valor')}`,
    `Licencia: ${dato('licencia', 'nombre')}, versión ${dato('licencia', 'version')} (${dato('licencia', 'urlTexto')})`,
    `Codificación: ${dato('codificacion', 'esquema')}, ${typeof unidades === 'number' ? unidades : NO_INDICADO} unidades, del "${dato('codificacion', 'primerCodigo')}" al "${dato('codificacion', 'ultimoCodigo')}", Callao "${dato('codificacion', 'callao')}"`,
    `Sistema de coordenadas: ${dato('sistemaCoordenadas', 'nombre')}`,
    `Archivo local: ${dato('archivoLocal', 'ruta')}`,
  ];
}

const CAMPOS_DE_TEXTO: readonly (readonly string[])[] = [
  ['fuente', 'publicador'],
  ['fuente', 'conjunto'],
  ['fuente', 'identificador'],
  ['fuente', 'naturalezaDeLosLimites'],
  ['fuente', 'fuenteEnAtributos', 'campo'],
  ['fuente', 'fuenteEnAtributos', 'valor'],
  ['licencia', 'id'],
  ['licencia', 'nombre'],
  ['licencia', 'version'],
  ['licencia', 'urlTexto'],
  ['atribucion', 'texto'],
  ['sistemaCoordenadas', 'nombre'],
  ['codificacion', 'esquema'],
  ['codificacion', 'primerCodigo'],
  ['codificacion', 'ultimoCodigo'],
  ['codificacion', 'callao'],
  ['archivoLocal', 'ruta'],
  ['archivoLocal', 'sha256'],
];

const CAMPOS_ENTEROS: readonly (readonly string[])[] = [
  ['codificacion', 'unidades'],
  ['archivoLocal', 'bytes'],
];

/** Errores de una configuración que dice estar confirmada pero no trae todos los datos que se usan. */
function erroresDeCompletitud(config: unknown): string[] {
  const errores: string[] = [];
  for (const ruta of CAMPOS_DE_TEXTO) {
    if (texto(config, ...ruta) === undefined) errores.push(`Falta "${ruta.join('.')}" (debe ser un texto no vacío).`);
  }
  for (const ruta of CAMPOS_ENTEROS) {
    if (!Number.isInteger(en(config, ...ruta))) errores.push(`Falta "${ruta.join('.')}" (debe ser un número entero).`);
  }
  return errores;
}

/**
 * Puerta de confirmación: solo deja continuar si `confirmadoPorEquipo` vale exactamente `true`
 * (cualquier otro valor, incluido el texto "true", se rechaza) y la configuración está completa.
 */
export function evaluarPuerta(config: unknown): Puerta {
  const resumen = resumirFuente(config);

  if (!esObjeto(config)) {
    return {
      permitido: false,
      motivo: 'La configuración de la fuente no es un objeto JSON válido.',
      errores: ['La raíz de fuente.config.json debe ser un objeto.'],
      resumen,
    };
  }

  if (config['confirmadoPorEquipo'] !== true) {
    return {
      permitido: false,
      motivo:
        'El Equipo todavía no confirmó la fuente de la geometría: "confirmadoPorEquipo" no es true en fuente.config.json.',
      errores: [],
      resumen,
    };
  }

  const errores = erroresDeCompletitud(config);
  if (errores.length > 0) {
    return {
      permitido: false,
      motivo: 'La fuente figura como confirmada, pero fuente.config.json está incompleto.',
      errores,
      resumen,
    };
  }

  return { permitido: true, config: config as unknown as FuenteConfig, resumen };
}

/**
 * Campos `fuente` y `licencia` de la Geometría (design.md, "Geometría del mapa"). El tipo `Geometria` no tiene
 * un campo aparte para la atribución: la Página 400 la muestra desde `licencia` ("atribución visible si la licencia
 * lo exige"), así que ahí van juntos el aviso de atribución y la licencia con su enlace.
 */
export function camposDeGeometria(config: FuenteConfig): Pick<Geometria, 'fuente' | 'licencia'> {
  const { fuente, licencia, atribucion } = config;
  return {
    fuente:
      `${fuente.publicador}. Conjunto «${fuente.conjunto}» (identificador ${fuente.identificador}). ` +
      `Fuente indicada en los datos: ${fuente.fuenteEnAtributos.valor}. ` +
      `Naturaleza de los límites: ${fuente.naturalezaDeLosLimites}.`,
    licencia: `${atribucion.texto} Licencia: ${licencia.nombre}, versión ${licencia.version} (${licencia.urlTexto}).`,
  };
}
