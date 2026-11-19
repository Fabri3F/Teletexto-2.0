// Tipos de la geometría de entrada y validación estricta de lo que entrega Mapshaper (GeoJSON).
// Todo lo que no sea un polígono o multipolígono cerrado y con coordenadas finitas se rechaza con
// un mensaje: nunca se descarta ni se corrige una geometría en silencio.

import { fallo, ok, type Resultado } from './result.ts';

/** Longitud y latitud en grados. */
export type Posicion = readonly [number, number];
/** Anillo cerrado: el primer y el último punto son iguales. */
export type Anillo = readonly Posicion[];
/** Un anillo exterior seguido de sus huecos (convención de GeoJSON). */
export type Poligono = readonly Anillo[];

/** Un registro de la fuente: una entidad con su código, su nombre y todas sus partes. */
export interface UnidadCruda {
  codigo: string;
  nombre: string;
  poligonos: readonly Poligono[];
}

/** Nombres de los campos de la fuente que contienen el código y el nombre (en el DBF: CODDEP y DEPARTAMEN). */
export interface CamposFuente {
  codigo: string;
  nombre: string;
}

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

function leerPosicion(valor: unknown): Posicion | undefined {
  if (!Array.isArray(valor) || valor.length < 2) return undefined;
  const [lon, lat] = valor as unknown[];
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return undefined;
  }
  return [lon, lat];
}

function leerAnillo(valor: unknown, etiqueta: string): Resultado<Anillo> {
  if (!Array.isArray(valor)) return fallo(`${etiqueta}: el anillo no es una lista de puntos.`);
  const puntos: Posicion[] = [];
  for (const [i, crudo] of (valor as unknown[]).entries()) {
    const posicion = leerPosicion(crudo);
    if (!posicion) return fallo(`${etiqueta}: el punto ${i} no tiene longitud y latitud finitas.`);
    puntos.push(posicion);
  }
  if (puntos.length < 4) return fallo(`${etiqueta}: un anillo necesita al menos 4 puntos y tiene ${puntos.length}.`);
  const primero = puntos[0] as Posicion;
  const ultimo = puntos[puntos.length - 1] as Posicion;
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) return fallo(`${etiqueta}: el anillo no está cerrado.`);
  return ok(puntos);
}

function leerPoligono(valor: unknown, etiqueta: string): Resultado<Poligono> {
  if (!Array.isArray(valor) || valor.length === 0) return fallo(`${etiqueta}: el polígono no tiene anillos.`);
  const anillos: Anillo[] = [];
  const errores: string[] = [];
  for (const [i, crudo] of (valor as unknown[]).entries()) {
    const r = leerAnillo(crudo, `${etiqueta}, anillo ${i}`);
    if (r.ok) anillos.push(r.valor);
    else errores.push(...r.errores);
  }
  return errores.length > 0 ? fallo(errores) : ok(anillos);
}

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

export interface OpcionesNormalizacion {
  /**
   * Junta en una sola unidad los registros que tienen el mismo código. Es lo que hace falta tras `-explode`, que reparte las
   * partes de un departamento en registros distintos. Con la fuente sin simplificar NO se usa: ahí un código repetido es un
   * error de la fuente y lo informa `verificarCodigos`.
   */
  agrupar?: boolean;
}

/**
 * Convierte una FeatureCollection de Mapshaper en unidades con todas sus partes. Rechaza geometrías que no
 * sean Polygon o MultiPolygon, registros sin código o sin nombre, y coordenadas no finitas.
 */
export function normalizarFeatures(
  coleccion: unknown,
  campos: CamposFuente,
  opciones: OpcionesNormalizacion = {},
): Resultado<UnidadCruda[]> {
  if (!esObjeto(coleccion) || coleccion['type'] !== 'FeatureCollection' || !Array.isArray(coleccion['features'])) {
    return fallo('La fuente no es una FeatureCollection de GeoJSON.');
  }
  const unidades: UnidadCruda[] = [];
  const errores: string[] = [];

  for (const [i, crudo] of (coleccion['features'] as unknown[]).entries()) {
    const etiqueta = `Registro ${i}`;
    if (!esObjeto(crudo) || !esObjeto(crudo['properties'])) {
      errores.push(`${etiqueta}: no tiene atributos.`);
      continue;
    }
    const codigo = textoDe(crudo['properties'][campos.codigo]);
    const nombre = textoDe(crudo['properties'][campos.nombre]);
    if (codigo === undefined) {
      errores.push(`${etiqueta}: falta el atributo "${campos.codigo}" con el código del departamento.`);
      continue;
    }
    if (nombre === undefined) {
      errores.push(`${etiqueta} (código ${codigo}): falta el atributo "${campos.nombre}" con el nombre.`);
      continue;
    }

    const geometria = crudo['geometry'];
    const etiquetaGeo = `${etiqueta} (código ${codigo})`;
    if (!esObjeto(geometria)) {
      errores.push(`${etiquetaGeo}: no tiene geometría.`);
      continue;
    }
    const coordenadas = geometria['coordinates'];
    let poligonosCrudos: unknown[];
    if (geometria['type'] === 'Polygon') {
      poligonosCrudos = [coordenadas];
    } else if (geometria['type'] === 'MultiPolygon' && Array.isArray(coordenadas)) {
      poligonosCrudos = coordenadas as unknown[];
    } else {
      errores.push(`${etiquetaGeo}: la geometría debe ser Polygon o MultiPolygon y es ${JSON.stringify(geometria['type'])}.`);
      continue;
    }
    if (poligonosCrudos.length === 0) {
      errores.push(`${etiquetaGeo}: la geometría no tiene polígonos.`);
      continue;
    }

    const poligonos: Poligono[] = [];
    for (const [ip, poligono] of poligonosCrudos.entries()) {
      const r = leerPoligono(poligono, `${etiquetaGeo}, polígono ${ip}`);
      if (r.ok) poligonos.push(r.valor);
      else errores.push(...r.errores);
    }
    unidades.push({ codigo, nombre, poligonos });
  }

  if (errores.length > 0) return fallo(errores);
  if (unidades.length === 0) return fallo('La fuente no tiene ningún registro.');
  return opciones.agrupar === true ? agruparPorCodigo(unidades) : ok(unidades);
}

/** Junta las unidades con el mismo código, en el orden en que aparece cada código y con sus partes en el orden recibido. */
function agruparPorCodigo(unidades: readonly UnidadCruda[]): Resultado<UnidadCruda[]> {
  const porCodigo = new Map<string, { codigo: string; nombre: string; poligonos: Poligono[] }>();
  const errores: string[] = [];
  for (const unidad of unidades) {
    const existente = porCodigo.get(unidad.codigo);
    if (existente === undefined) {
      porCodigo.set(unidad.codigo, { codigo: unidad.codigo, nombre: unidad.nombre, poligonos: [...unidad.poligonos] });
    } else if (existente.nombre !== unidad.nombre) {
      errores.push(`El código ${unidad.codigo} aparece con dos nombres: "${existente.nombre}" y "${unidad.nombre}".`);
    } else {
      existente.poligonos.push(...unidad.poligonos);
    }
  }
  return errores.length > 0 ? fallo(errores) : ok([...porCodigo.values()]);
}

/** Número de partes (anillos exteriores y huecos) de una unidad. Es la cuenta que registra fuente.config.json. */
export function contarPartes(poligonos: readonly Poligono[]): number {
  return poligonos.reduce((suma, poligono) => suma + poligono.length, 0);
}

/**
 * Número de puntos de una unidad, incluyendo el punto que cierra cada anillo. Es la misma cuenta que usa el
 * shapefile y que registra `fuente.config.json` en "vertices" (334 429 en total).
 */
export function contarPuntos(poligonos: readonly Poligono[]): number {
  return poligonos.reduce((suma, poligono) => suma + poligono.reduce((s, anillo) => s + anillo.length, 0), 0);
}
