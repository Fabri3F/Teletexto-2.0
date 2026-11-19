// Preparación única de la geometría del mapa de la Página 400.
//
// Tarea 3.1: configuración de la fuente y puerta de confirmación del Equipo.
// Tarea 3.2: lectura del shapefile, simplificación con Mapshaper, proyección, rutas SVG con un decimal, centroides
// y escritura de public/geo/departamentos.json. No corre mientras `confirmadoPorEquipo` no sea true en
// fuente.config.json ni mientras `aprobadoPorEquipo` no sea true en mapa.config.json.

export { camposDeGeometria, evaluarPuerta, resumirFuente, type FuenteConfig, type Puerta } from './fuente.ts';
export { evaluarParametros, type ParametrosMapa, type PuertaParametros } from './parametros.ts';
export { finalizar, generarGeometria, serializar, type Dependencias, type Entradas, type Registro } from './generar.ts';
export { tamanoComprimido } from './tamano.ts';
