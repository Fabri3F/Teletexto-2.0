// Generación de la Geometría del mapa (tarea 3.2): orquesta las puertas, la lectura de la fuente, las
// verificaciones, la búsqueda de simplificación, la construcción estricta y el límite de tamaño.
//
// Todo lo externo (Mapshaper y el disco) entra por `Dependencias`, para probar cada fallo sin esperar a
// la simplificación real y sin tocar el repositorio.

import type { Geometria } from '@teletexto/modelo';
import {
  ITERACIONES_BUSQUEDA,
  LIMITE_COMPRIMIDO_BYTES,
  OBJETIVO_COMPRIMIDO_BYTES,
  PORCENTAJE_MINIMO,
  PORCENTAJE_REFERENCIA,
  type ExcepcionAutorizada,
} from './constantes.ts';
import {
  construirGeometria,
  verificarCodigos,
  verificarExcepciones,
  verificarNombres,
  verificarPartes,
  type EsperadoPorDepartamento,
  type ExcepcionActiva,
  type FilaTabla,
  type Resumen,
} from './construir.ts';
import { camposDeGeometria, evaluarPuerta } from './fuente.ts';
import { normalizarFeatures, contarPartes, contarPuntos, type CamposFuente, type UnidadCruda } from './geojson.ts';
import { diferenciasConLosAprobados, evaluarParametros, type ParametrosMapa } from './parametros.ts';
import { fallo, ok, type Resultado } from './result.ts';
import { buscarSimplificacion, simplificarFuente } from './simplificacion.ts';
import { errorDeLimite, tamanoComprimido } from './tamano.ts';

export interface Dependencias {
  /** Lee el ZIP de la fuente. */
  leerZip: (ruta: string) => Uint8Array;
  /** Devuelve una FeatureCollection de GeoJSON, simplificada si `porcentaje` < 100. */
  simplificar: (zip: Uint8Array, porcentaje: number) => Promise<Resultado<unknown>>;
}

export const dependenciasReales = (leerZip: (ruta: string) => Uint8Array): Dependencias => ({
  leerZip,
  simplificar: simplificarFuente,
});

export interface Entradas {
  /** Contenido de fuente.config.json (ya leído como JSON). */
  fuente: unknown;
  /** Contenido de mapa.config.json (ya leído como JSON). */
  mapa: unknown;
  /** Tabla de Departamentos de la tarea 1.4. */
  tabla: readonly FilaTabla[];
  /**
   * Parámetros que el Equipo aprobó (constantes del código). `mapa.config.json` debe coincidir exactamente: un valor
   * distinto en el archivo, aunque diga `aprobadoPorEquipo: true`, impide generar la geometría.
   */
  aprobados: ParametrosMapa;
  /** Excepciones que el Equipo autorizó (constantes del código). Solo valen las que coinciden con esta lista. */
  excepcionesAutorizadas: readonly ExcepcionAutorizada[];
}

export interface Registro {
  /** Porcentaje de vértices que se conservaron en la simplificación elegida. */
  porcentajeConservado: number;
  /** Tamaño comprimido del archivo final (gzip de zlib, nivel 6). */
  comprimidoBytes: number;
  /** Bytes del archivo final sin comprimir. */
  bytes: number;
  /** Objetivo operativo de tamaño comprimido que se buscó, en bytes. */
  objetivoBytes: number;
  /** Verdadero si el archivo final cumple el objetivo operativo. Con el límite absoluto siempre se cumple, o no se escribe. */
  objetivoCumplido: boolean;
  /** Identificación de las partes de la fuente que no se dibujan por una excepción autorizada y comprobada. */
  excepciones: string[];
  /** Intentos de simplificación: porcentaje, tamaño comprimido y partes que no se pudieron dibujar. */
  intentos: { porcentaje: number; comprimidoBytes: number; partesOmitidas: number }[];
  resumen: Resumen;
  /** Partes y puntos de la fuente sin simplificar. */
  fuenteOriginal: { partes: number; puntos: number };
  /** Partes tras simplificar y antes de proyectar. */
  partesTrasSimplificar: number;
}

export interface Resultado3_2 {
  geometria: Geometria;
  /** Texto exacto que se escribe en `public/geo/departamentos.json`. */
  texto: string;
  registro: Registro;
}

/** Atributos de la fuente que contienen el código y el nombre (fuente.config.json: CODDEP y DEPARTAMEN). */
export function camposDeLaFuente(config: unknown): Resultado<CamposFuente> {
  const cod = (config as { codificacion?: { campoCodigo?: unknown; campoNombre?: unknown } }).codificacion;
  const codigo = typeof cod?.campoCodigo === 'string' && cod.campoCodigo !== '' ? cod.campoCodigo : undefined;
  const nombre = typeof cod?.campoNombre === 'string' && cod.campoNombre !== '' ? cod.campoNombre : undefined;
  if (codigo === undefined || nombre === undefined) {
    return fallo('fuente.config.json no indica los campos "codificacion.campoCodigo" y "codificacion.campoNombre".');
  }
  return ok({ codigo, nombre });
}

/** Partes, anillos exteriores, huecos y vértices esperados por Departamento, registrados al inspeccionar el ZIP (tarea 3.1). */
export function esperadoDeLaFuente(config: unknown): Resultado<EsperadoPorDepartamento[]> {
  const lista = (config as { verificacion?: { esperadoPorDepartamento?: unknown } }).verificacion?.esperadoPorDepartamento;
  if (!Array.isArray(lista) || lista.length === 0) {
    return fallo('fuente.config.json no trae "verificacion.esperadoPorDepartamento": no se pueden comprobar las partes.');
  }
  const esperado: EsperadoPorDepartamento[] = [];
  for (const [i, fila] of (lista as unknown[]).entries()) {
    const f = fila as { codigo?: unknown; partes?: unknown; vertices?: unknown; anillosExteriores?: unknown; huecos?: unknown };
    if (
      typeof f.codigo !== 'string' ||
      !Number.isInteger(f.partes) ||
      !Number.isInteger(f.vertices) ||
      !Number.isInteger(f.anillosExteriores) ||
      !Number.isInteger(f.huecos)
    ) {
      return fallo(`fuente.config.json: la fila ${i} de "esperadoPorDepartamento" no tiene código, partes, anillos exteriores, huecos y vértices.`);
    }
    esperado.push({
      codigo: f.codigo,
      partes: f.partes as number,
      vertices: f.vertices as number,
      anillosExteriores: f.anillosExteriores as number,
      huecos: f.huecos as number,
    });
  }
  return ok(esperado);
}

/** Serialización de la geometría: JSON en UTF-8 con un salto de línea final, sin espacios sobrantes. */
export function serializar(geometria: Geometria): string {
  return `${JSON.stringify(geometria)}\n`;
}

/**
 * Última comprobación antes de escribir: serializa la geometría, mide su tamaño comprimido y aplica el límite de 80 KB
 * (requisito 4.17). Si lo supera, falla: no se elimina ninguna geometría para que quepa.
 */
export function finalizar(geometria: Geometria): Resultado<{ texto: string; comprimidoBytes: number }> {
  const texto = serializar(geometria);
  const comprimidoBytes = tamanoComprimido(texto);
  const excede = errorDeLimite(comprimidoBytes);
  if (excede !== undefined) return fallo(excede);
  return ok({ texto, comprimidoBytes });
}

/** Lee y normaliza la fuente sin simplificar, y la compara con lo registrado en fuente.config.json. */
async function leerFuenteOriginal(
  dep: Dependencias,
  zip: Uint8Array,
  campos: CamposFuente,
  tabla: readonly FilaTabla[],
  esperado: readonly EsperadoPorDepartamento[],
): Promise<Resultado<UnidadCruda[]>> {
  const cruda = await dep.simplificar(zip, 100);
  if (!cruda.ok) return cruda;
  const unidades = normalizarFeatures(cruda.valor, campos);
  if (!unidades.ok) return unidades;

  const errores: string[] = [];
  for (const r of [
    verificarCodigos(unidades.valor, tabla),
    verificarNombres(unidades.valor, tabla),
    verificarPartes(unidades.valor, esperado, 'Fuente sin simplificar'),
  ]) {
    if (!r.ok) errores.push(...r.errores);
  }

  // Los puntos de la fuente deben coincidir con los que registró la inspección del ZIP (tarea 3.1).
  for (const { codigo, vertices } of esperado) {
    const unidad = unidades.valor.find((u) => u.codigo === codigo);
    if (unidad !== undefined && contarPuntos(unidad.poligonos) !== vertices) {
      errores.push(
        `Fuente sin simplificar: el Departamento ${codigo} tiene ${contarPuntos(unidad.poligonos)} puntos y fuente.config.json registra ${vertices}.`,
      );
    }
  }
  return errores.length > 0 ? fallo(errores) : unidades;
}

/**
 * Genera la geometría. Falla —con todos los motivos— si la fuente no está confirmada, si los parámetros del mapa no
 * están aprobados o no coinciden con los aprobados, si faltan o sobran códigos respecto de la tabla de la tarea 1.4, si se
 * pierde o no se puede dibujar alguna parte (salvo una excepción autorizada y comprobada), o si el archivo comprimido supera
 * el límite de 80 KB. No elimina geometrías para cumplirlo.
 */
export async function generarGeometria(entradas: Entradas, dep: Dependencias): Promise<Resultado<Resultado3_2>> {
  // 1. Puerta de la fuente (tarea 3.1).
  const puerta = evaluarPuerta(entradas.fuente);
  if (!puerta.permitido) return fallo([puerta.motivo, ...puerta.errores]);

  // 2. Puerta de los parámetros del mapa: lo que la spec no define no se inventa, y lo aprobado no se cambia en silencio.
  const parametros = evaluarParametros(entradas.mapa);
  if (!parametros.permitido) return fallo([parametros.motivo, ...parametros.pendientes.map((p) => `Pendiente: ${p}`)]);
  const diferencias = diferenciasConLosAprobados(parametros.parametros, entradas.aprobados);
  if (diferencias.length > 0) {
    return fallo([
      'Los parámetros de mapa.config.json no coinciden con los que aprobó el Equipo. Cambiarlos exige una nueva aprobación y actualizar las constantes del código.',
      ...diferencias,
    ]);
  }

  const campos = camposDeLaFuente(entradas.fuente);
  if (!campos.ok) return campos;
  const esperado = esperadoDeLaFuente(entradas.fuente);
  if (!esperado.ok) return esperado;
  const camposGeometria = camposDeGeometria(puerta.config);

  // 3. Fuente original: códigos, nombres, partes y puntos.
  let zip: Uint8Array;
  try {
    zip = dep.leerZip(puerta.config.archivoLocal.ruta);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return fallo(`No se pudo leer ${puerta.config.archivoLocal.ruta}: ${detalle}`);
  }
  const original = await leerFuenteOriginal(dep, zip, campos.valor, entradas.tabla, esperado.valor);
  if (!original.ok) return original;
  const partesOriginales = original.valor.reduce((s, u) => s + contarPartes(u.poligonos), 0);
  const puntosOriginales = original.valor.reduce((s, u) => s + contarPuntos(u.poligonos), 0);

  // 3b. Excepciones: solo las autorizadas en el código, con su huella de coordenadas comprobada contra la fuente.
  const registradas = (entradas.fuente as { partesNoRepresentables?: unknown }).partesNoRepresentables;
  const excepcionesVerificadas = verificarExcepciones(registradas, entradas.excepcionesAutorizadas, original.valor, parametros.parametros);
  if (!excepcionesVerificadas.ok) return excepcionesVerificadas;
  const excepciones: readonly ExcepcionActiva[] = excepcionesVerificadas.valor;

  // 4. Búsqueda de la simplificación: el mayor porcentaje con el que el archivo comprimido cumple el objetivo.
  const medir = async (porcentaje: number): Promise<Resultado<IntentoDeMedicion>> => {
    const simplificada = await dep.simplificar(zip, porcentaje);
    if (!simplificada.ok) return simplificada;
    const unidades = normalizarFeatures(simplificada.valor, campos.valor, { agrupar: true });
    if (!unidades.ok) return unidades;
    const construida = construirGeometria(unidades.valor, entradas.tabla, parametros.parametros, camposGeometria, {
      tolerante: true,
      excepciones,
    });
    if (!construida.ok) return construida;
    return ok({
      porcentaje,
      comprimidoBytes: tamanoComprimido(serializar(construida.valor.geometria)),
      partesOmitidas: construida.valor.resumen.partesOmitidas,
    });
  };
  // Se busca primero el objetivo operativo y solo si es inalcanzable se acepta el límite absoluto. Nunca se supera el límite.
  let busqueda = await buscarSimplificacion({
    evaluar: medir,
    objetivoBytes: OBJETIVO_COMPRIMIDO_BYTES,
    porcentajeMinimo: PORCENTAJE_MINIMO,
    iteraciones: ITERACIONES_BUSQUEDA,
    inicial: PORCENTAJE_REFERENCIA,
  });
  if (!busqueda.ok) {
    busqueda = await buscarSimplificacion({
      evaluar: medir,
      objetivoBytes: LIMITE_COMPRIMIDO_BYTES,
      porcentajeMinimo: PORCENTAJE_MINIMO,
      iteraciones: ITERACIONES_BUSQUEDA,
      inicial: PORCENTAJE_REFERENCIA,
    });
  }
  if (!busqueda.ok) return busqueda;
  const { elegido, intentos } = busqueda.valor;

  // 5. Construcción ESTRICTA con el porcentaje elegido: nada se descarta en silencio.
  const simplificada = await dep.simplificar(zip, elegido.porcentaje);
  if (!simplificada.ok) return simplificada;
  const unidades = normalizarFeatures(simplificada.valor, campos.valor, { agrupar: true });
  if (!unidades.ok) return unidades;
  const partesTrasSimplificar = unidades.valor.reduce((s, u) => s + contarPartes(u.poligonos), 0);

  const errores: string[] = [];
  for (const r of [
    verificarCodigos(unidades.valor, entradas.tabla),
    verificarPartes(unidades.valor, esperado.valor, `Simplificado al ${formatoPorcentaje(elegido.porcentaje)}`, excepciones),
  ]) {
    if (!r.ok) errores.push(...r.errores);
  }
  const construida = construirGeometria(unidades.valor, entradas.tabla, parametros.parametros, camposGeometria, { excepciones });
  if (!construida.ok) errores.push(...construida.errores);
  if (errores.length > 0) {
    return fallo([
      ...errores,
      'No se escribió ningún archivo. Las partes perdidas no se eliminan en silencio: hay que decidir cómo representarlas ' +
        '(más espacio en el viewBox, otra escala o aceptar explícitamente su omisión).',
    ]);
  }
  if (!construida.ok) return construida; // no ocurre: sin errores arriba, la construcción tuvo éxito

  // 5b. La salida debe tener todos los Departamentos de la tabla y todas las partes representables de la fuente.
  const partesRepresentables = partesOriginales - excepciones.length;
  const { geometria: g, resumen } = construida.valor;
  const salidaIncompleta: string[] = [];
  if (g.departamentos.length !== entradas.tabla.length) {
    salidaIncompleta.push(`La salida tiene ${g.departamentos.length} Departamentos y la tabla tiene ${entradas.tabla.length}.`);
  }
  if (resumen.partes !== partesRepresentables) {
    salidaIncompleta.push(
      `La salida tiene ${resumen.partes} partes y debe tener ${partesRepresentables} (${partesOriginales} de la fuente menos ${excepciones.length} de excepción).`,
    );
  }
  if (salidaIncompleta.length > 0) return fallo([...salidaIncompleta, 'No se escribió ningún archivo.']);

  // 6. Texto final y límite de 80 KB.
  const final = finalizar(g);
  if (!final.ok) return final;
  const { texto, comprimidoBytes } = final.valor;

  return ok({
    geometria: g,
    texto,
    registro: {
      porcentajeConservado: elegido.porcentaje,
      comprimidoBytes,
      bytes: Buffer.byteLength(texto, 'utf8'),
      objetivoBytes: OBJETIVO_COMPRIMIDO_BYTES,
      objetivoCumplido: comprimidoBytes <= OBJETIVO_COMPRIMIDO_BYTES,
      excepciones: excepciones.map((e) => e.id),
      intentos: intentos.map((i) => ({ porcentaje: i.porcentaje, comprimidoBytes: i.comprimidoBytes, partesOmitidas: i.partesOmitidas })),
      resumen,
      fuenteOriginal: { partes: partesOriginales, puntos: puntosOriginales },
      partesTrasSimplificar,
    },
  });
}

interface IntentoDeMedicion {
  porcentaje: number;
  comprimidoBytes: number;
  partesOmitidas: number;
}

function formatoPorcentaje(porcentaje: number): string {
  return `${Number(porcentaje.toPrecision(4))} %`;
}
