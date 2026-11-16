// Tipos de la ingesta: errores del Parser_de_Contenido, entradas y salida de `loadAll`, y la
// configuración de páginas. Los tipos del contenido (Page, DatasetAlertas, etc.) viven en
// @teletexto/modelo y no se redefinen aquí.

import type { DatasetAlertas, Page } from '@teletexto/modelo';

/**
 * Error de lectura de un archivo de datos (Requisito 13.3): indica el archivo, el campo inválido
 * (o la causa, si no hay un campo identificable) y la regla incumplida.
 */
export interface ParseError {
  /** Nombre del archivo, tal como lo recibió el parser. */
  archivo: string;
  /** Ruta del campo inválido, por ejemplo `alertas[0].vigencia.fin`. Falta si el error afecta a todo el archivo. */
  campo?: string;
  /** Explicación del problema cuando no hay un campo identificable (archivo vacío, demasiado grande, JSON roto). */
  causa?: string;
  /** Regla incumplida, en español. */
  regla: string;
}

/** Archivo de datos que recibe `loadAll`. */
export interface FileInput {
  /** Nombre del archivo, con o sin carpetas. `alertas.json` es el conjunto de alertas; cualquier otro es una página. */
  nombre: string;
  /** Contenido completo del archivo, decodificado como UTF-8. */
  texto: string;
}

/** Contenido completo y validado: todo o nada (Requisito 13.2). */
export interface ContentSet {
  /** Ordenadas por número de página. */
  paginas: Page[];
  /** Conjunto único de alertas de las Páginas 101 y 400, si se cargó. */
  alertas?: DatasetAlertas;
}

/** Configuración de una página que se agrega al sistema (Requisito 17.3). */
export interface PageConfig {
  numero: number;
}

export interface ConfigProblema {
  /** Posición de la configuración dentro de la lista recibida. */
  indice: number;
  /** Número recibido, tal cual (puede no ser un número). */
  numero: unknown;
  regla: string;
}

/** Motivo del rechazo de una configuración de páginas (Requisito 17.3). */
export interface ConfigError {
  motivo: string;
  problemas: ConfigProblema[];
}
