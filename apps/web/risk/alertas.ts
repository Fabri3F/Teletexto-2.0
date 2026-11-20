// Lógica pura de las Alertas_de_Riesgo del cliente (tarea 5.1). Requisitos 2.2, 2.7, 2.8, 4.2, 4.5, 4.6, 4.9, 4.13, 4.16 y 4.20.
//
// Las Páginas 101 y 400 leen el mismo `/d/alertas.json` y calculan sus vistas con estas mismas funciones, así que el nivel, la
// vigencia y los Departamentos de una alerta son idénticos en ambas por construcción (Requisitos 2.8 y 4.13).
//
// Todas las funciones son puras: reciben `ahora` en milisegundos y no leen el reloj. El llamador calcula el instante una sola
// vez con su `ahora()` inyectable y lo comparte entre las llamadas de un mismo render. Ninguna función asigna un nivel por
// defecto: un Departamento sin alertas vigentes tiene nivel `null`.
//
// Los datos vienen de la red o de la Caché_Local y el cliente no los valida con el esquema, así que las funciones no confían en
// su forma: una alerta con fechas ilegibles, un nivel que no es uno de `NIVELES_RIESGO` o ningún código de Departamento válido
// no es vigente. Así nunca se inventa un nivel y las dos páginas siguen coincidiendo.

import {
  CODIGOS_DEPARTAMENTO,
  FUENTES_ALERTA,
  NIVELES_RIESGO,
  type AlertaRiesgo,
  type CodigoDepartamento,
  type DatasetAlertas,
  type FuenteAlerta,
  type NivelRiesgo,
} from '@teletexto/modelo';
import { instanteDeIso } from '../format/dates.ts';

/** Riesgo de un Departamento: su nivel máximo (o `null` sin alertas vigentes) y sus alertas vigentes. */
export interface RiesgoDepartamento {
  readonly nivel: NivelRiesgo | null;
  readonly alertas: AlertaRiesgo[];
}

/** Resultado de combinar las fuentes: las alertas disponibles y el nombre de cada fuente cuyo contenido no está disponible. */
export interface ResultadoFusion {
  readonly alertas: AlertaRiesgo[];
  readonly fuentesNoDisponibles: FuenteAlerta[];
}

const CODIGOS = new Set<string>(CODIGOS_DEPARTAMENTO);

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Posición del nivel en `NIVELES_RIESGO` (0 es el más bajo), o `undefined` si no es un nivel reconocido. */
function rangoDeNivel(nivel: unknown): number | undefined {
  const rango = (NIVELES_RIESGO as readonly unknown[]).indexOf(nivel);
  return rango === -1 ? undefined : rango;
}

/** Códigos de Departamento válidos de una alerta, sin repetir y en su orden. Ignora lo que no sea uno de los 25 códigos. */
function departamentosValidos(alerta: Record<string, unknown>): CodigoDepartamento[] {
  const departamentos = alerta['departamentos'];
  if (!Array.isArray(departamentos)) return [];
  const vistos = new Set<CodigoDepartamento>();
  for (const codigo of departamentos as unknown[]) {
    if (typeof codigo === 'string' && CODIGOS.has(codigo)) vistos.add(codigo as CodigoDepartamento);
  }
  return [...vistos];
}

/**
 * Verdadero si la alerta es vigente en el instante `ahora` (milisegundos): `inicio <= ahora <= fin`, con los dos extremos
 * incluidos (Requisito 4.6 y Propiedad 28). Es falso si:
 * - `ahora` no es un número finito;
 * - alguna fecha de la vigencia no es una fecha UTC ISO 8601 con `Z` que exista en el calendario;
 * - el nivel no es uno de `NIVELES_RIESGO`;
 * - no cubre ningún Departamento válido de los 25.
 * Funciona igual con datos de la red o de la Caché_Local: una alerta vencida deja de ser vigente al avanzar `ahora`.
 */
export function esVigente(alerta: AlertaRiesgo, ahora: number): boolean {
  if (typeof ahora !== 'number' || !Number.isFinite(ahora)) return false;
  const a: unknown = alerta;
  if (!esObjeto(a)) return false;
  if (rangoDeNivel(a['nivel']) === undefined) return false;
  if (departamentosValidos(a).length === 0) return false;
  const vigencia = a['vigencia'];
  if (!esObjeto(vigencia)) return false;
  const inicio = instanteDeIso(vigencia['inicio']);
  const fin = instanteDeIso(vigencia['fin']);
  return inicio !== undefined && fin !== undefined && inicio <= ahora && ahora <= fin;
}

/**
 * Alertas vigentes del dataset en el instante `ahora`, en el orden del dataset. Es la única función con la que las Páginas 101 y
 * 400 obtienen sus alertas. Un dataset ausente o sin una lista de alertas da una lista vacía. No quita identificadores
 * repetidos ni modifica el dataset.
 */
export function alertasVigentes(dataset: DatasetAlertas | null | undefined, ahora: number): AlertaRiesgo[] {
  const alertas: unknown = dataset?.alertas;
  if (!Array.isArray(alertas)) return [];
  return (alertas as AlertaRiesgo[]).filter((alerta) => esVigente(alerta, ahora));
}

/**
 * Riesgo de cada uno de los 25 Departamentos en el instante `ahora` (Requisitos 4.2, 4.5, 4.9 y 4.16). Cada entrada trae sus
 * alertas vigentes, en el orden recibido, y su nivel: el máximo entre ellas o `null` si no tiene ninguna. Nunca hay un nivel
 * por defecto. Una alerta que cubre varios Departamentos está en todos ellos y cuenta para el máximo de cada uno.
 *
 * El objeto tiene exactamente las 25 claves. Su orden de enumeración propio NO es el de `CODIGOS_DEPARTAMENTO`: JavaScript
 * enumera primero las claves que parecen enteros (`'10'` a `'25'`) y después `'01'` a `'09'`. Para recorrerlos en orden hay que
 * iterar `CODIGOS_DEPARTAMENTO` y buscar cada código.
 */
export function riesgoPorDepartamento(alertas: readonly AlertaRiesgo[], ahora: number): Record<CodigoDepartamento, RiesgoDepartamento> {
  const rangos = new Map<CodigoDepartamento, number>();
  const porCodigo = new Map<CodigoDepartamento, AlertaRiesgo[]>(CODIGOS_DEPARTAMENTO.map((codigo) => [codigo, []]));
  if (Array.isArray(alertas)) {
    for (const alerta of alertas) {
      if (!esVigente(alerta, ahora)) continue;
      const rango = rangoDeNivel((alerta as unknown as Record<string, unknown>)['nivel']) as number;
      for (const codigo of departamentosValidos(alerta as unknown as Record<string, unknown>)) {
        porCodigo.get(codigo)?.push(alerta);
        if (rango > (rangos.get(codigo) ?? -1)) rangos.set(codigo, rango);
      }
    }
  }
  const resultado = {} as Record<CodigoDepartamento, RiesgoDepartamento>;
  for (const codigo of CODIGOS_DEPARTAMENTO) {
    const rango = rangos.get(codigo);
    resultado[codigo] = { nivel: rango === undefined ? null : (NIVELES_RIESGO[rango] as NivelRiesgo), alertas: porCodigo.get(codigo) ?? [] };
  }
  return resultado;
}

type CampoDeFecha = 'publicadoEn' | 'actualizadoEn';

/**
 * Comparador de alertas: nivel de mayor a menor y, a igual nivel, por el campo de fecha de la más reciente a la más antigua.
 * Un nivel no reconocido y una fecha ilegible van al final. Un empate exacto se desempata por `id` ascendente, para que el
 * resultado no dependa del orden de entrada.
 */
function comparadorPor(campo: CampoDeFecha): (a: AlertaRiesgo, b: AlertaRiesgo) => number {
  const rango = (alerta: AlertaRiesgo): number => rangoDeNivel((alerta as unknown as Record<string, unknown>)['nivel']) ?? -1;
  const instante = (alerta: AlertaRiesgo): number => instanteDeIso((alerta as unknown as Record<string, unknown>)[campo]) ?? Number.NEGATIVE_INFINITY;
  return (a, b) => {
    const rangoA = rango(a);
    const rangoB = rango(b);
    if (rangoA !== rangoB) return rangoA > rangoB ? -1 : 1;
    const fechaA = instante(a);
    const fechaB = instante(b);
    if (fechaA !== fechaB) return fechaA > fechaB ? -1 : 1;
    const idA = String(a.id);
    const idB = String(b.id);
    if (idA === idB) return 0;
    return idA < idB ? -1 : 1;
  };
}

/**
 * Alertas vigentes de un Departamento en el instante `ahora`, para su panel de detalle (Requisitos 4.8, 4.9 y 4.20): ordenadas
 * por nivel de mayor a menor y, a igual nivel, por fecha de ACTUALIZACIÓN de la más reciente a la más antigua. Una alerta de
 * varios Departamentos aparece en el detalle de cada uno. Una lista vacía significa "Sin información disponible". Un código que
 * no es uno de los 25 da una lista vacía.
 */
export function detalleDepartamento(codigo: string, alertas: readonly AlertaRiesgo[], ahora: number): AlertaRiesgo[] {
  if (typeof codigo !== 'string' || !CODIGOS.has(codigo) || !Array.isArray(alertas)) return [];
  return alertas
    .filter((alerta) => esVigente(alerta, ahora) && departamentosValidos(alerta as unknown as Record<string, unknown>).includes(codigo as CodigoDepartamento))
    .sort(comparadorPor('actualizadoEn'));
}

/**
 * Copia ordenada de las alertas para la Página 101 (Requisito 2.2): por nivel de mayor a menor y, a igual nivel, por fecha de
 * PUBLICACIÓN de la más reciente a la más antigua. Es una permutación de la lista: no quita ni añade alertas y no modifica la
 * original. No filtra por vigencia: para eso está `alertasVigentes`.
 */
export function sortAlerts(alertas: readonly AlertaRiesgo[]): AlertaRiesgo[] {
  if (!Array.isArray(alertas)) return [];
  return [...alertas].sort(comparadorPor('publicadoEn'));
}

/**
 * Combina las alertas de SENAMHI e INDECI (Requisito 2.7). Cada fuente llega como una lista (disponible, aunque esté vacía) o como
 * `null` o `undefined` (no disponible); cualquier otro valor tampoco se puede leer y cuenta como no disponible. El resultado
 * tiene las alertas de SENAMHI y después las de INDECI, y el nombre de cada fuente no disponible, para que la página lo indique.
 *
 * Se descartan las alertas cuya propiedad `fuente` no corresponde a la lista en la que vienen, y los identificadores repetidos
 * (con o sin la misma fuente): vale la primera aparición. Una alerta cuyo `id` no es un texto no se puede comparar y se conserva.
 * No filtra por vigencia ni ordena.
 */
export function mergeSources(
  senamhi: readonly AlertaRiesgo[] | null | undefined,
  indeci: readonly AlertaRiesgo[] | null | undefined,
): ResultadoFusion {
  const [primera, segunda] = FUENTES_ALERTA;
  const alertas: AlertaRiesgo[] = [];
  const fuentesNoDisponibles: FuenteAlerta[] = [];
  const identificadores = new Set<string>();
  for (const [fuente, lista] of [[primera, senamhi], [segunda, indeci]] as const) {
    if (!Array.isArray(lista)) {
      fuentesNoDisponibles.push(fuente);
      continue;
    }
    for (const alerta of lista as unknown[]) {
      if (!esObjeto(alerta) || alerta['fuente'] !== fuente) continue;
      const id = alerta['id'];
      if (typeof id === 'string') {
        if (identificadores.has(id)) continue;
        identificadores.add(id);
      }
      alertas.push(alerta as unknown as AlertaRiesgo);
    }
  }
  return { alertas, fuentesNoDisponibles };
}
