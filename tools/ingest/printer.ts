// Pretty_Printer (design.md, "Servicio_Contenido"): serializa objetos Página y DatasetAlertas a JSON
// en UTF-8, con las claves en un orden fijo, sangría de 2 espacios y un salto de línea final
// (Requisitos 13.4 y 13.5). El mismo contenido siempre produce exactamente el mismo texto.

import type { DatasetAlertas, Page } from '@teletexto/modelo';

/**
 * Orden fijo de las claves de cada tipo de objeto. Sigue el orden de las propiedades de los esquemas
 * de @teletexto/modelo; una prueba comprueba que no queda ninguna propiedad del esquema fuera de esta
 * tabla. Las claves que no figuran aquí (no deberían existir en contenido válido) se escriben al final,
 * en orden alfabético, para no perder datos.
 */
export const ORDEN_CLAVES = {
  page: ['numero', 'titulo', 'tipo', 'esDatoDePrueba', 'umbralHoras', 'metadatos', 'datos', 'registros'],
  metadatos: ['fuente', 'publicadoEn', 'actualizadoEn'],
  // Entradas del menú de la Portada y precios: no comparten ninguna clave salvo `id` y `esDatoDePrueba`.
  registro: ['id', 'esDatoDePrueba', 'numero', 'nombre', 'producto', 'mercado', 'unidad', 'precioCentimos', 'fecha'],
  dataset: ['metadatos', 'esDatoDePrueba', 'alertas'],
  alerta: [
    'id',
    'esDatoDePrueba',
    'titulo',
    'tipoRiesgo',
    'nivel',
    'nivelOficial',
    'departamentos',
    'vigencia',
    'publicadoEn',
    'actualizadoEn',
    'fuente',
    'aviso',
  ],
  nivelOficial: ['texto', 'esMaximo'],
  vigencia: ['inicio', 'fin'],
  aviso: ['id', 'textoOriginal', 'urlOriginal', 'referencia', 'recomendaciones', 'resumen'],
  recomendacion: ['clave', 'frases'],
  resumen: ['texto', 'hashFuente', 'verificacion'],
  verificacion: ['estado', 'verificadoEn'],
} as const satisfies Record<string, readonly string[]>;

type Transformador = (valor: unknown) => unknown;

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Devuelve una copia del objeto con las claves ordenadas, aplicando `hijos` a los valores anidados. */
function ordenar(valor: unknown, orden: readonly string[], hijos: Record<string, Transformador> = {}): unknown {
  if (!esObjeto(valor)) return valor;
  const claves = Object.keys(valor).filter((clave) => valor[clave] !== undefined);
  const conocidas = orden.filter((clave) => claves.includes(clave));
  const otras = claves.filter((clave) => !orden.includes(clave)).sort();
  return Object.fromEntries(
    [...conocidas, ...otras].map((clave) => {
      const transformar = hijos[clave];
      return [clave, transformar ? transformar(valor[clave]) : valor[clave]];
    }),
  );
}

const lista =
  (transformar: Transformador): Transformador =>
  (valor) =>
    Array.isArray(valor) ? valor.map(transformar) : valor;

const metadatos: Transformador = (v) => ordenar(v, ORDEN_CLAVES.metadatos);
const registro: Transformador = (v) => ordenar(v, ORDEN_CLAVES.registro);
const nivelOficial: Transformador = (v) => ordenar(v, ORDEN_CLAVES.nivelOficial);
const vigencia: Transformador = (v) => ordenar(v, ORDEN_CLAVES.vigencia);
const recomendacion: Transformador = (v) => ordenar(v, ORDEN_CLAVES.recomendacion);
const verificacion: Transformador = (v) => ordenar(v, ORDEN_CLAVES.verificacion);
const resumen: Transformador = (v) => ordenar(v, ORDEN_CLAVES.resumen, { verificacion });
const aviso: Transformador = (v) =>
  ordenar(v, ORDEN_CLAVES.aviso, { recomendaciones: lista(recomendacion), resumen });
const alerta: Transformador = (v) => ordenar(v, ORDEN_CLAVES.alerta, { nivelOficial, vigencia, aviso });

function escribir(valor: unknown): string {
  return `${JSON.stringify(valor, null, 2)}\n`;
}

/** Serializa una Página a JSON canónico: UTF-8, claves en orden fijo, sangría de 2 espacios y `\n` final. */
export function printPage(page: Page): string {
  return escribir(ordenar(page, ORDEN_CLAVES.page, { metadatos, registros: lista(registro) }));
}

/** Serializa un conjunto de alertas a JSON canónico, con las mismas reglas que `printPage`. */
export function printAlertas(dataset: DatasetAlertas): string {
  return escribir(ordenar(dataset, ORDEN_CLAVES.dataset, { metadatos, alertas: lista(alerta) }));
}
