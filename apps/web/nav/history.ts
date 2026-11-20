// Historial de sesión del cliente (tarea 4.6, parte 2). Requisitos 5.7 y 5.8.
//
// Es una pila de las páginas visitadas: la última es la página actual y "Atrás" la saca. Es lógica pura e inmutable: no usa
// `window.history`, `pushState`, `popstate`, `location`, temporizadores ni ninguna API del navegador. La integración con el
// historial del navegador (el botón "Atrás" del sistema y las URL) es de otra tarea; aquí solo se decide qué página sigue.

import type { PageNumber } from '@teletexto/modelo';
import { isValidPageNumber } from './router.ts';

/**
 * Historial de la sesión: las páginas visitadas, de la más antigua a la actual. No hay "adelante": al volver, la página
 * actual se descarta. El estado está congelado, y cada función devuelve uno nuevo en lugar de modificarlo.
 */
export interface Historial {
  readonly paginas: readonly PageNumber[];
}

const crear = (paginas: readonly PageNumber[]): Historial => Object.freeze({ paginas: Object.freeze([...paginas]) });

/** Historial sin ninguna visita. */
export const historialVacio: Historial = crear([]);

/** Página actual: la última visitada, o `undefined` si todavía no se visitó ninguna. */
export function actual(h: Historial): PageNumber | undefined {
  return h.paginas[h.paginas.length - 1];
}

/**
 * Registra la visita a una página, que pasa a ser la actual. No cambia nada (devuelve el mismo historial) si el número no es
 * un Número_de_Página válido o si ya es la página actual, para no duplicarla. Visitar una página anterior que no es la
 * actual sí añade una entrada: 100, 101, 100 deja tres.
 */
export function visit(h: Historial, n: number): Historial {
  if (!isValidPageNumber(n) || n === actual(h)) return h;
  return crear([...h.paginas, n]);
}

/**
 * Vuelve a la página visitada inmediatamente antes: descarta la actual y la anterior pasa a ser la actual (Requisito 5.7).
 * Si no hay una página anterior, devuelve el mismo historial sin cambios (Requisito 5.8).
 */
export function back(h: Historial): Historial {
  if (h.paginas.length < 2) return h;
  return crear(h.paginas.slice(0, -1));
}
