// CLI de ingesta (Servicio_Contenido en build). Este módulo expone el Parser_de_Contenido y el
// Pretty_Printer (tarea 2.1). Los conectores, el orquestador de resúmenes y el escritor atómico
// se añaden en las tareas 2.6, 2.8 y 10.4.

export { err, ok, type Result } from './result.ts';
export {
  loadAll,
  NOMBRE_ARCHIVO_ALERTAS,
  parseAlertas,
  parsePage,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
  validatePageConfig,
} from './parser.ts';
export { printAlertas, printPage } from './printer.ts';
export type { ConfigError, ConfigProblema, ContentSet, FileInput, PageConfig, ParseError } from './tipos.ts';
