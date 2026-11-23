// Reducer del estado de sincronización de la Portada (tarea 5.8). Requisitos 1.13 a 1.18, Propiedad 36.
//
// Es lógica pura e inmutable: `reducir(estado, evento)` devuelve el estado nuevo, o el MISMO estado si el evento no cambia nada.
// No lee el reloj ni usa ninguna API del navegador; las fechas llegan dentro de los eventos. Los iconos y los textos de la vista,
// y la conexión con el service worker, son de otras tareas.
//
// Reglas:
// - "Sin conexión" prevalece: mientras el valor sea "Sin conexión" solo `online` lo cambia (a "Sincronizando", porque al volver
//   la conexión se sincroniza). Un `syncOk` válido recibido sin conexión sí actualiza `ultimaSyncOk`, pero conserva el valor.
// - `ultimaSyncOk` solo cambia con un `syncOk` válido y nunca se borra. Si falla una sincronización ("Error"), se conserva.
// - "Sincronizado" siempre tiene `ultimaSyncOk` definida.
// - `syncFalla` representa SOLO el fallo final, tras agotar los 3 reintentos del Requisito 7.6. Los reintentos intermedios no
//   emiten ningún evento: mientras dura la sincronización el valor sigue siendo "Sincronizando" (Requisito 1.15).
// - `syncOk` se emite solo cuando terminó con éxito la sincronización de las Páginas 100, 101, 200 y 400 y de la geometría
//   (Requisito 1.16): es responsabilidad de quien lo emite.

import { instanteDeIso } from '../format/dates.ts';

/** Los cinco valores del Estado_de_Sincronización, con los textos exactos de los Requisitos 1.13 a 1.18. */
export const VALORES_SYNC = ['Cargando', 'Sincronizando', 'Sincronizado', 'Error', 'Sin conexión'] as const;
export type ValorSync = (typeof VALORES_SYNC)[number];

/** Estado de sincronización. `ultimaSyncOk` es la fecha y hora de la última sincronización exitosa, en UTC ISO 8601 con `Z`. */
export interface EstadoSync {
  readonly valor: ValorSync;
  readonly ultimaSyncOk?: string;
}

/** Eventos del reducer, discriminados por `tipo`. `syncOk` trae el instante UTC ISO de la sincronización exitosa. */
export type EventoSync =
  | { readonly tipo: 'abrir' }
  | { readonly tipo: 'contenidoListo' }
  | { readonly tipo: 'syncInicia' }
  | { readonly tipo: 'syncOk'; readonly at: string }
  | { readonly tipo: 'syncFalla' }
  | { readonly tipo: 'offline' }
  | { readonly tipo: 'online' };

/** Estado congelado. La propiedad `ultimaSyncOk` solo existe si hay una fecha. */
function crear(valor: ValorSync, ultimaSyncOk: string | undefined): EstadoSync {
  return Object.freeze(ultimaSyncOk === undefined ? { valor } : { valor, ultimaSyncOk });
}

/** Estado con el valor y la fecha dados, o el mismo estado si no cambia nada. */
function conCambios(estado: EstadoSync, valor: ValorSync, ultimaSyncOk: string | undefined = estado.ultimaSyncOk): EstadoSync {
  return estado.valor === valor && estado.ultimaSyncOk === ultimaSyncOk ? estado : crear(valor, ultimaSyncOk);
}

/**
 * Estado con el que arranca la Portada: "Cargando" (Requisito 1.14). Si se pasa la fecha de la última sincronización exitosa
 * de una sesión anterior y es un ISO UTC válido, se conserva; si falta o es ilegible, se omite y no se inventa ninguna.
 */
export function crearEstadoInicial(ultimaSyncOk?: string | null): EstadoSync {
  const valida = typeof ultimaSyncOk === 'string' && instanteDeIso(ultimaSyncOk) !== undefined;
  return crear('Cargando', valida ? ultimaSyncOk : undefined);
}

/**
 * Aplica un evento al estado.
 *
 * | Evento           | Efecto |
 * |------------------|--------|
 * | `abrir`          | "Cargando", conservando `ultimaSyncOk`. Si el valor es "Sin conexión", no cambia. |
 * | `contenidoListo` | No cambia el estado. |
 * | `syncInicia`     | "Sincronizando". Sin cambio si ya lo está o si es "Sin conexión". |
 * | `syncOk(at)`     | "Sincronizado" con `ultimaSyncOk = at`. Con "Sin conexión" solo actualiza la fecha. Un `at` que no es un ISO UTC válido se ignora. |
 * | `syncFalla`      | "Error", conservando `ultimaSyncOk`. Sin cambio si ya es "Error" o si es "Sin conexión". |
 * | `offline`        | "Sin conexión", conservando `ultimaSyncOk`. |
 * | `online`         | De "Sin conexión" pasa a "Sincronizando". En cualquier otro valor no cambia. |
 *
 * Un evento desconocido o mal formado se ignora sin lanzar excepción.
 */
export function reducir(estado: EstadoSync, evento: EventoSync): EstadoSync {
  const e: unknown = evento;
  const tipo = typeof e === 'object' && e !== null ? (e as { tipo?: unknown }).tipo : undefined;
  const sinConexion = estado.valor === 'Sin conexión';
  switch (tipo) {
    case 'abrir':
      return sinConexion ? estado : conCambios(estado, 'Cargando');
    case 'contenidoListo':
      return estado;
    case 'syncInicia':
      return sinConexion ? estado : conCambios(estado, 'Sincronizando');
    case 'syncOk': {
      const at = (e as { at?: unknown }).at;
      if (typeof at !== 'string' || instanteDeIso(at) === undefined) return estado;
      return conCambios(estado, sinConexion ? 'Sin conexión' : 'Sincronizado', at);
    }
    case 'syncFalla':
      return sinConexion ? estado : conCambios(estado, 'Error');
    case 'offline':
      return conCambios(estado, 'Sin conexión');
    case 'online':
      return sinConexion ? conCambios(estado, 'Sincronizando') : estado;
    default:
      return estado;
  }
}
