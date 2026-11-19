// Valores que la spec define o que el Equipo aprobó expresamente para la geometría del mapa (tarea 3.2).
// Lo que está aquí NO se lee de ningún archivo: cambiarlo exige una nueva aprobación del Equipo y se ve en la revisión
// del código. `mapa.config.json` y `fuente.config.json` solo se aceptan si coinciden con estos valores (ver
// `verificarAprobados` en parametros.ts y `verificarExcepciones` en construir.ts).

import type { ParametrosMapa } from './parametros.ts';

/** 1 KB = 1024 bytes, igual que en los demás límites de tamaño del proyecto. */
export const KB = 1024;
/** Límite absoluto de la Geometría_del_Mapa comprimida (requisito 4.17, design.md "Presupuesto de tamaño"). */
export const LIMITE_COMPRIMIDO_BYTES = 80 * KB;
/**
 * Objetivo operativo (decisión del Equipo en la tarea 3.2): 76 800 bytes comprimidos, es decir 75 KB. Sustituye al margen
 * de 50 KB que mencionaba el diseño, que no permite conservar las 39 partes con la precisión aprobada.
 */
export const OBJETIVO_COMPRIMIDO_BYTES = 75 * KB;
/** Las rutas SVG llevan coordenadas con un decimal (tasks.md 3.2, design.md línea de Simplificación). */
export const DECIMALES_COORDENADAS = 1;
/** Única proyección admitida: "equirrectangular simple" (design.md). */
export const TIPO_PROYECCION = 'equirrectangular';
/** Codificación del DBF de la fuente (el archivo .cpg del ZIP dice UTF-8; ver fuente.config.json). */
export const CODIFICACION_DBF = 'utf8';
/**
 * Cota inferior de la búsqueda de simplificación, en % de vértices que se conservan. No es un parámetro
 * cartográfico: es el límite técnico de la búsqueda. Si ni con este valor se alcanza el objetivo de tamaño,
 * la herramienta falla en lugar de seguir simplificando.
 */
export const PORCENTAJE_MINIMO = 0.1;
/**
 * Porcentaje de vértices con el que arranca la búsqueda (8,3 %). Es el valor con el que el Equipo evaluó la alternativa
 * elegida: es solo el primer punto de la búsqueda, no un valor fijo. El porcentaje que se usa lo decide el tamaño.
 */
export const PORCENTAJE_REFERENCIA = 8.3;
/** Pasos de la bisección (en escala logarítmica) que busca el mayor porcentaje que cumple el objetivo de tamaño. */
export const ITERACIONES_BUSQUEDA = 12;
/** Nivel de gzip (zlib) con el que se mide el tamaño comprimido. El diseño dice "zlib" sin nivel: el Equipo fijó el nivel 6. */
export const NIVEL_GZIP = 6;

/**
 * Parámetros cartográficos aprobados por el Equipo (tarea 3.2). `mapa.config.json` debe coincidir exactamente con estos
 * valores: si alguien los cambia en el archivo y no aquí, la herramienta se niega a generar la geometría.
 */
export const PARAMETROS_APROBADOS: ParametrosMapa = {
  version: '1',
  proyeccion: {
    tipo: TIPO_PROYECCION,
    paraleloEstandarGrados: -13,
    unidadesPorGrado: 500,
    longitudOrigenGrados: -81.379,
    latitudOrigenGrados: 0.012,
  },
  viewBox: [0, 0, 6225, 9207],
};

/** Una parte de la fuente que el Equipo autorizó a no dibujar, porque no es representable a un decimal. */
export interface ExcepcionAutorizada {
  /** `código#polígono.anillo`, con los índices de la fuente sin simplificar (de 0). */
  id: string;
  codigo: string;
  poligono: number;
  anillo: number;
  /** SHA-256 (hexadecimal) del texto `JSON.stringify(anillo)` del anillo tal como lo entrega Mapshaper sin simplificar. */
  sha256: string;
}

/**
 * Únicas excepciones autorizadas: el hueco 21#6.2 de Puno (4 puntos, 3 distintos, unos 19 × 24 m, área de 0,039 m²), que no
 * se puede dibujar con un decimal a ninguna escala razonable. Cualquier otra parte que no se pueda dibujar es un error.
 * El detalle y la aprobación están en `partesNoRepresentables` de fuente.config.json.
 */
export const EXCEPCIONES_AUTORIZADAS: readonly ExcepcionAutorizada[] = [
  {
    id: '21#6.2',
    codigo: '21',
    poligono: 6,
    anillo: 2,
    sha256: 'bd73b61b164180fcb36dd008ea4e42b6f0929bd73b732a889611b8d993b01522',
  },
];
