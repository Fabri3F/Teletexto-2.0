// Frescura de la información de una página (tarea 5.8). Requisitos 7.9, 7.10, 7.11 y 7.12, Propiedad 35.
//
// Función pura: recibe el instante `ahora` en milisegundos y no lee el reloj. El umbral (6 h para las Páginas 101 y 400, 24 h para
// la 100 y la 200) NO está aquí: viene de la configuración de cada página (`umbralHoras` del manifiesto), convertido a milisegundos
// por quien llama.
//
// Requisito 7.12: el aviso "Información desactualizada" no se retira mientras el usuario lee la página. Eso lo cumple la vista
// evaluando la frescura con el `syncedAt` de la página tal como estaba cuando se abrió, y no con el que deja una sincronización en
// segundo plano; este módulo no guarda estado.

import { instanteDeIso } from '../format/dates.ts';

/**
 * - `nunca`: la página no tiene una sincronización exitosa legible. Se muestra "Nunca sincronizada" y ninguna fecha.
 * - `vigente`: no pasó más que el umbral desde la última sincronización exitosa.
 * - `desactualizada`: pasó más que el umbral. Se muestra el aviso "Información desactualizada" con la fecha.
 */
export type Frescura = 'nunca' | 'vigente' | 'desactualizada';

/**
 * Frescura de una página en el instante `ahora` (milisegundos), con su umbral en milisegundos:
 * - Sin `syncedAt`, o con uno que no es un ISO UTC válido con `Z`: `nunca`. No se estima ninguna fecha.
 * - Si `ahora - syncedAt` es MAYOR que el umbral: `desactualizada`. Exactamente igual al umbral sigue siendo `vigente`.
 * - Si `syncedAt` es posterior a `ahora` (reloj atrasado), la diferencia es negativa y es `vigente`.
 * - Si `ahora` o `umbralMs` no son números finitos, o el umbral es negativo, no se puede garantizar que la información esté al
 *   día y el resultado es `desactualizada` (cuando hay una fecha legible).
 */
export function estadoFrescura(syncedAt: string | null | undefined, ahora: number, umbralMs: number): Frescura {
  const sincronizadoEn = instanteDeIso(syncedAt);
  if (sincronizadoEn === undefined) return 'nunca';
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) return 'desactualizada';
  if (typeof umbralMs !== 'number' || !Number.isFinite(umbralMs) || umbralMs < 0) return 'desactualizada';
  return ahora - sincronizadoEn > umbralMs ? 'desactualizada' : 'vigente';
}
