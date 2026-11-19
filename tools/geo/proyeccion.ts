// Proyección equirrectangular y paso a décimas de unidad (coordenadas con un decimal).
//
// Las coordenadas de salida se manejan como ENTEROS en décimas de unidad del viewBox: 12.3 es 123. Así
// la deduplicación, las áreas y los centroides se calculan con aritmética entera exacta, sin errores de
// coma flotante, y lo que se mide es exactamente lo que se escribe en las rutas.

import type { Posicion } from './geojson.ts';
import type { ProyeccionEquirrectangular } from './parametros.ts';

/** Punto en décimas de unidad del viewBox (enteros). */
export type PuntoDecimas = readonly [number, number];

/**
 * Crea la función de proyección.
 *   x = (longitud - longitudOrigen) * cos(paraleloEstandar) * unidadesPorGrado
 *   y = (latitudOrigen - latitud) * unidadesPorGrado
 * El norte queda arriba (y crece hacia el sur), como en un SVG.
 */
export function crearProyector(proyeccion: ProyeccionEquirrectangular): (posicion: Posicion) => [number, number] {
  const radianes = (proyeccion.paraleloEstandarGrados * Math.PI) / 180;
  const escalaX = Math.cos(radianes) * proyeccion.unidadesPorGrado;
  const escalaY = proyeccion.unidadesPorGrado;
  return ([longitud, latitud]) => [
    (longitud - proyeccion.longitudOrigenGrados) * escalaX,
    (proyeccion.latitudOrigenGrados - latitud) * escalaY,
  ];
}

/** Redondea una coordenada a un decimal y la devuelve en décimas (entero). Nunca produce -0. */
export function aDecimas(valor: number): number {
  const decimas = Math.round(valor * 10);
  return decimas === 0 ? 0 : decimas;
}

/** Texto de una coordenada en décimas, con el mínimo de caracteres: 123 es "12.3" y 120 es "12". */
export function textoDecimas(decimas: number): string {
  return String(decimas / 10);
}
