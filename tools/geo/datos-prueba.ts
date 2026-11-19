// Datos sintéticos SOLO para las pruebas de tools/geo. No son límites reales: son figuras geométricas
// simples (rectángulos y cuadrados) fáciles de razonar, con una tabla de Departamentos de ejemplo.

import type { Anillo, Poligono, UnidadCruda } from './geojson.ts';
import type { FilaTabla } from './construir.ts';
import type { ParametrosMapa } from './parametros.ts';

/** Anillo rectangular cerrado, en grados (longitud, latitud). */
export function rectangulo(lon0: number, lat0: number, lon1: number, lat1: number): Anillo {
  return [
    [lon0, lat0],
    [lon1, lat0],
    [lon1, lat1],
    [lon0, lat1],
    [lon0, lat0],
  ];
}

/** Tabla de ejemplo: tres Departamentos con códigos de dos dígitos. */
export const TABLA_EJEMPLO: readonly FilaTabla[] = [
  { codigo: '01', nombre: 'Alfa' },
  { codigo: '02', nombre: 'Beta' },
  { codigo: '03', nombre: 'Gamma' },
];

/** Unidades de ejemplo: Alfa con una parte, Beta con dos partes separadas y Gamma con una parte y un hueco. */
export function unidadesEjemplo(): UnidadCruda[] {
  const sencillo: Poligono = [rectangulo(0, 0, 1, 1)];
  const isla: Poligono = [rectangulo(2, 0, 2.5, 0.5)];
  const conHueco: Poligono = [rectangulo(0, 2, 2, 4), rectangulo(0.5, 2.5, 1.5, 3.5)];
  return [
    { codigo: '01', nombre: 'ALFA', poligonos: [sencillo] },
    { codigo: '02', nombre: 'BETA', poligonos: [[rectangulo(0, 5, 1, 6)], isla] },
    { codigo: '03', nombre: 'GAMMA', poligonos: [conHueco] },
  ];
}

/**
 * Parámetros de PRUEBA: no son los parámetros del proyecto (que no están definidos). Plate carrée a 10 unidades por grado
 * con el origen en la esquina superior izquierda del dibujo de ejemplo.
 */
export const PARAMETROS_PRUEBA: ParametrosMapa = {
  version: 'prueba',
  proyeccion: {
    tipo: 'equirrectangular',
    paraleloEstandarGrados: 0,
    unidadesPorGrado: 10,
    longitudOrigenGrados: 0,
    latitudOrigenGrados: 6,
  },
  viewBox: [0, 0, 30, 70],
};

/** Convierte unidades de ejemplo en la FeatureCollection de GeoJSON que entrega Mapshaper. */
export function comoFeatureCollection(unidades: readonly UnidadCruda[], campos = { codigo: 'CODDEP', nombre: 'DEPARTAMEN' }): unknown {
  return {
    type: 'FeatureCollection',
    features: unidades.map((u) => ({
      type: 'Feature',
      properties: { [campos.codigo]: u.codigo, [campos.nombre]: u.nombre },
      geometry:
        u.poligonos.length === 1
          ? { type: 'Polygon', coordinates: u.poligonos[0] }
          : { type: 'MultiPolygon', coordinates: u.poligonos },
    })),
  };
}
