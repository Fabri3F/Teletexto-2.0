// Parámetros cartográficos del mapa (tarea 3.2) y su puerta de aprobación.
//
// La spec dice "proyección equirrectangular simple a un viewBox fijo" (design.md, "Geometría del mapa:
// fuente, licencia y simplificación") pero NO fija ninguna cifra: ni la escala, ni el paralelo estándar,
// ni el origen, ni las dimensiones del viewBox, ni la versión de la geometría. Esos valores no se
// inventan en el código: se leen de `mapa.config.json` y `tools/geo` no genera nada hasta que el Equipo
// los apruebe (`aprobadoPorEquipo: true`), igual que con la fuente en la tarea 3.1.

import { TIPO_PROYECCION } from './constantes.ts';

export interface ProyeccionEquirrectangular {
  tipo: typeof TIPO_PROYECCION;
  /** Paralelo donde la escala horizontal es igual a la vertical, en grados. La escala horizontal es cos(paralelo) × unidadesPorGrado. */
  paraleloEstandarGrados: number;
  /** Unidades del viewBox que equivalen a un grado de latitud. */
  unidadesPorGrado: number;
  /** Longitud, en grados, que se proyecta en x = 0. */
  longitudOrigenGrados: number;
  /** Latitud, en grados, que se proyecta en y = 0. */
  latitudOrigenGrados: number;
}

export interface ParametrosMapa {
  /** Valor del campo `version` de la Geometría. */
  version: string;
  proyeccion: ProyeccionEquirrectangular;
  /** `[minX, minY, ancho, alto]`, en unidades del viewBox. */
  viewBox: readonly [number, number, number, number];
}

export type PuertaParametros =
  | { permitido: true; parametros: ParametrosMapa }
  | { permitido: false; motivo: string; pendientes: string[] };

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const esFinito = (valor: unknown): valor is number => typeof valor === 'number' && Number.isFinite(valor);

/** Parámetros que faltan o no son válidos, con la regla que deben cumplir. Lista vacía si están completos. */
function pendientesDe(config: Objeto): string[] {
  const pendientes: string[] = [];
  const proyeccion = esObjeto(config['proyeccion']) ? config['proyeccion'] : {};

  if (typeof config['version'] !== 'string' || config['version'].trim() === '') {
    pendientes.push('version: texto no vacío con la versión de la geometría.');
  }
  if (proyeccion['tipo'] !== TIPO_PROYECCION) {
    pendientes.push(`proyeccion.tipo: debe ser "${TIPO_PROYECCION}".`);
  }
  const paralelo = proyeccion['paraleloEstandarGrados'];
  if (!esFinito(paralelo) || Math.abs(paralelo) >= 90) {
    pendientes.push('proyeccion.paraleloEstandarGrados: número en grados, mayor que -90 y menor que 90.');
  }
  const escala = proyeccion['unidadesPorGrado'];
  if (!esFinito(escala) || escala <= 0) {
    pendientes.push('proyeccion.unidadesPorGrado: número mayor que 0 (unidades del viewBox por grado de latitud).');
  }
  const longitud = proyeccion['longitudOrigenGrados'];
  if (!esFinito(longitud) || longitud < -180 || longitud > 180) {
    pendientes.push('proyeccion.longitudOrigenGrados: número entre -180 y 180 (longitud que se proyecta en x = 0).');
  }
  const latitud = proyeccion['latitudOrigenGrados'];
  if (!esFinito(latitud) || latitud < -90 || latitud > 90) {
    pendientes.push('proyeccion.latitudOrigenGrados: número entre -90 y 90 (latitud que se proyecta en y = 0).');
  }
  const viewBox = config['viewBox'];
  if (
    !Array.isArray(viewBox) ||
    viewBox.length !== 4 ||
    !viewBox.every(esFinito) ||
    (viewBox[2] as number) <= 0 ||
    (viewBox[3] as number) <= 0
  ) {
    pendientes.push('viewBox: lista [minX, minY, ancho, alto] de números, con ancho y alto mayores que 0.');
  }
  return pendientes;
}

/**
 * Compara los parámetros leídos de `mapa.config.json` con los que el Equipo aprobó (constantes del código). Devuelve un
 * mensaje por cada valor distinto; una lista vacía significa que coinciden exactamente. Así `aprobadoPorEquipo: true` no
 * basta: un valor cambiado en el archivo, sin pasar por el código y su revisión, impide generar la geometría.
 */
export function diferenciasConLosAprobados(parametros: ParametrosMapa, aprobados: ParametrosMapa): string[] {
  const diferencias: string[] = [];
  const comparar = (nombre: string, actual: unknown, aprobado: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(aprobado)) {
      diferencias.push(`${nombre}: el archivo tiene ${JSON.stringify(actual)} y el Equipo aprobó ${JSON.stringify(aprobado)}.`);
    }
  };
  comparar('version', parametros.version, aprobados.version);
  comparar('proyeccion.tipo', parametros.proyeccion.tipo, aprobados.proyeccion.tipo);
  comparar('proyeccion.paraleloEstandarGrados', parametros.proyeccion.paraleloEstandarGrados, aprobados.proyeccion.paraleloEstandarGrados);
  comparar('proyeccion.unidadesPorGrado', parametros.proyeccion.unidadesPorGrado, aprobados.proyeccion.unidadesPorGrado);
  comparar('proyeccion.longitudOrigenGrados', parametros.proyeccion.longitudOrigenGrados, aprobados.proyeccion.longitudOrigenGrados);
  comparar('proyeccion.latitudOrigenGrados', parametros.proyeccion.latitudOrigenGrados, aprobados.proyeccion.latitudOrigenGrados);
  comparar('viewBox', parametros.viewBox, aprobados.viewBox);
  return diferencias;
}

/**
 * Puerta de los parámetros del mapa: solo deja continuar si `aprobadoPorEquipo` vale exactamente `true`
 * y todos los parámetros están definidos y son válidos.
 */
export function evaluarParametros(config: unknown): PuertaParametros {
  if (!esObjeto(config)) {
    return {
      permitido: false,
      motivo: 'La configuración de los parámetros del mapa no es un objeto JSON válido.',
      pendientes: ['La raíz de mapa.config.json debe ser un objeto.'],
    };
  }

  const pendientes = pendientesDe(config);

  if (config['aprobadoPorEquipo'] !== true) {
    return {
      permitido: false,
      motivo:
        'El Equipo todavía no aprobó los parámetros del mapa: "aprobadoPorEquipo" no es true en mapa.config.json. ' +
        'La spec no define el viewBox, la escala, el paralelo estándar, el origen ni la versión, y no se inventan.',
      pendientes,
    };
  }

  if (pendientes.length > 0) {
    return {
      permitido: false,
      motivo: 'Los parámetros del mapa figuran como aprobados, pero mapa.config.json está incompleto o es inválido.',
      pendientes,
    };
  }

  const proyeccion = config['proyeccion'] as Objeto;
  return {
    permitido: true,
    parametros: {
      version: (config['version'] as string).trim(),
      proyeccion: {
        tipo: TIPO_PROYECCION,
        paraleloEstandarGrados: proyeccion['paraleloEstandarGrados'] as number,
        unidadesPorGrado: proyeccion['unidadesPorGrado'] as number,
        longitudOrigenGrados: proyeccion['longitudOrigenGrados'] as number,
        latitudOrigenGrados: proyeccion['latitudOrigenGrados'] as number,
      },
      viewBox: config['viewBox'] as unknown as readonly [number, number, number, number],
    },
  };
}
