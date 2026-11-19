// Construcción de la Geometría del mapa a partir de las unidades de la fuente: códigos contra la tabla de la
// tarea 1.4, conservación de todas las partes, proyección, rutas relativas con un decimal y centroides.
// Es lógica pura (sin archivos ni Mapshaper) para poder probar cada fallo por separado.

import { createHash } from 'node:crypto';
import type { CodigoDepartamento, DepartamentoGeometria, Geometria } from '@teletexto/modelo';
import { DECIMALES_COORDENADAS, type ExcepcionAutorizada } from './constantes.ts';
import {
  anillosDeRutaRelativa,
  centroideDecimas,
  motivoInvalido,
  redondearAnillo,
  redondearPoligonos,
  rutaRelativa,
  type AnilloDecimas,
} from './anillos.ts';
import { contarPuntos, type Anillo, type Posicion, type UnidadCruda } from './geojson.ts';
import type { ParametrosMapa } from './parametros.ts';
import { crearProyector, textoDecimas } from './proyeccion.ts';
import { fallo, ok, type Resultado } from './result.ts';

/** Una fila de la tabla de la tarea 1.4: código y nombre del Departamento. */
export interface FilaTabla {
  codigo: string;
  nombre: string;
}

/** Partes esperadas por Departamento, tomadas de la fuente sin simplificar (fuente.config.json). */
export interface EsperadoPorDepartamento {
  codigo: string;
  partes: number;
  vertices: number;
  /** Anillos exteriores y huecos de la fuente. Si se indican, también se comprueba que no se confunda un hueco con una isla. */
  anillosExteriores?: number;
  huecos?: number;
}

/** Cuentas de una geometría, para informar y registrar. */
export interface Resumen {
  departamentos: number;
  partes: number;
  /** Puntos de los anillos de entrada, incluido el que cierra cada anillo (misma cuenta que fuente.config.json). */
  puntosEntrada: number;
  /** Vértices que se escriben en las rutas. */
  verticesSalida: number;
  /** Partes que no se pudieron dibujar. Solo puede ser mayor que 0 en modo tolerante; en modo estricto es un error. */
  partesOmitidas: number;
  /** Partes que no se dibujaron por una excepción aprobada (ver `ExcepcionActiva`), con su identificación. */
  partesExcepcion: string[];
}

/**
 * Una excepción ya comprobada contra la fuente sin simplificar (ver `verificarExcepciones`): la parte que el Equipo autorizó a
 * no dibujar. Se reconoce por sus puntos: un anillo es esa parte si TODOS sus puntos son puntos del anillo registrado, algo que
 * también cumple el mismo anillo tras simplificar, porque simplificar solo quita puntos y no los mueve.
 */
export interface ExcepcionActiva {
  id: string;
  codigo: string;
  /** Índice del anillo dentro de su polígono: 0 es un exterior y mayor que 0 es un hueco. */
  anillo: number;
  /** Puntos del anillo original, como `longitud,latitud`. */
  puntos: ReadonlySet<string>;
}

const clavePunto = (p: Posicion): string => `${p[0]},${p[1]}`;

/** Verdadero si el anillo es la parte de la excepción (o la misma parte tras simplificar). */
export function esLaExcepcion(anillo: Anillo, codigo: string, excepcion: ExcepcionActiva): boolean {
  return excepcion.codigo === codigo && anillo.length > 0 && anillo.every((p) => excepcion.puntos.has(clavePunto(p)));
}

function excepcionDe(anillo: Anillo, codigo: string, excepciones: readonly ExcepcionActiva[]): ExcepcionActiva | undefined {
  return excepciones.find((e) => esLaExcepcion(anillo, codigo, e));
}

export interface OpcionesConstruccion {
  /** Partes que el Equipo autorizó a no dibujar. Cualquier otra parte que no se pueda dibujar es un error. */
  excepciones?: readonly ExcepcionActiva[];
  /**
   * Solo para MEDIR el tamaño durante la búsqueda de simplificación: omite las partes que no se pueden dibujar a un
   * decimal en lugar de fallar. Un resultado construido así nunca se escribe: el archivo final se construye en modo estricto.
   */
  tolerante?: boolean;
}

const CODIGO_UBIGEO = /^\d{2}$/;

/** Los códigos de la fuente deben ser exactamente los de la tabla: ni faltan, ni sobran, ni se repiten. */
export function verificarCodigos(unidades: readonly UnidadCruda[], tabla: readonly FilaTabla[]): Resultado<void> {
  const errores: string[] = [];
  const esperados = new Set(tabla.map((fila) => fila.codigo));
  const vistos = new Map<string, number>();

  for (const { codigo } of unidades) vistos.set(codigo, (vistos.get(codigo) ?? 0) + 1);

  for (const [codigo, veces] of vistos) {
    if (veces > 1) errores.push(`El código ${codigo} está repetido: aparece en ${veces} registros.`);
    if (!esperados.has(codigo)) {
      errores.push(`El código ${codigo} de la fuente no está en la tabla de Departamentos (tarea 1.4): sobra.`);
    }
  }
  const faltan = tabla.filter((fila) => !vistos.has(fila.codigo));
  for (const fila of faltan) {
    errores.push(`Falta el código ${fila.codigo} (${fila.nombre}) de la tabla de Departamentos (tarea 1.4).`);
  }
  if (unidades.length !== tabla.length) {
    errores.unshift(`Hay ${unidades.length} unidades en la fuente y la tabla de Departamentos tiene ${tabla.length}.`);
  }
  return errores.length > 0 ? fallo(errores) : ok(undefined);
}

/**
 * Comprueba que la fuente y la configuración son coherentes: los códigos tienen la forma de UBIGEO y los nombres
 * de la fuente (en mayúsculas y sin tildes) corresponden a los de la tabla. Los nombres que se muestran salen
 * siempre de la tabla de la tarea 1.4, no de la fuente.
 */
export function verificarNombres(unidades: readonly UnidadCruda[], tabla: readonly FilaTabla[]): Resultado<void> {
  const sinTildes = (texto: string): string => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  const porCodigo = new Map(tabla.map((fila) => [fila.codigo, fila.nombre]));
  const errores: string[] = [];
  for (const unidad of unidades) {
    if (!CODIGO_UBIGEO.test(unidad.codigo)) errores.push(`El código "${unidad.codigo}" no tiene dos dígitos.`);
    const nombreTabla = porCodigo.get(unidad.codigo);
    if (nombreTabla !== undefined && sinTildes(nombreTabla) !== sinTildes(unidad.nombre)) {
      errores.push(
        `El código ${unidad.codigo} se llama "${unidad.nombre}" en la fuente y "${nombreTabla}" en la tabla de Departamentos.`,
      );
    }
  }
  return errores.length > 0 ? fallo(errores) : ok(undefined);
}

/** Anillos exteriores y huecos de una unidad, sin contar las partes que son una excepción autorizada. */
function contarEstructura(unidad: UnidadCruda, excepciones: readonly ExcepcionActiva[]): { exteriores: number; huecos: number } {
  let exteriores = 0;
  let huecos = 0;
  for (const poligono of unidad.poligonos) {
    for (const [indice, anillo] of poligono.entries()) {
      if (excepcionDe(anillo, unidad.codigo, excepciones) !== undefined) continue;
      if (indice === 0) exteriores++;
      else huecos++;
    }
  }
  return { exteriores, huecos };
}

/**
 * Comprueba que cada Departamento conserva todas sus partes y que la fuente tiene las partes que registra
 * fuente.config.json. `etapa` indica de qué comparación se trata, para el mensaje. Las partes que son una excepción
 * autorizada no se cuentan, y tampoco se esperan: con la fuente sin simplificar se llama sin excepciones, para contar las 40.
 * Si el registro trae anillos exteriores y huecos, también se comprueba que cada uno conserve su papel (un hueco que pasa a
 * ser una isla sumaría las mismas partes pero dibujaría otra cosa).
 */
export function verificarPartes(
  unidades: readonly UnidadCruda[],
  esperado: readonly EsperadoPorDepartamento[],
  etapa: string,
  excepciones: readonly ExcepcionActiva[] = [],
): Resultado<void> {
  const errores: string[] = [];
  const porCodigo = new Map(unidades.map((u) => [u.codigo, u]));
  for (const { codigo, partes, anillosExteriores, huecos } of esperado) {
    const unidad = porCodigo.get(codigo);
    if (unidad === undefined) continue; // un código ausente lo informa verificarCodigos
    const deLaUnidad = excepciones.filter((e) => e.codigo === codigo);
    const esperadas = partes - deLaUnidad.length;
    const estructura = contarEstructura(unidad, excepciones);
    const actuales = estructura.exteriores + estructura.huecos;
    if (actuales !== esperadas) {
      errores.push(
        `${etapa}: el Departamento ${codigo} (${unidad.nombre}) tiene ${actuales} parte(s) y debe tener ${esperadas}` +
          (actuales < esperadas ? ` (se perdieron ${esperadas - actuales}).` : '.'),
      );
      continue;
    }
    if (anillosExteriores !== undefined && huecos !== undefined) {
      const exterioresEsperados = anillosExteriores - deLaUnidad.filter((e) => e.anillo === 0).length;
      const huecosEsperados = huecos - deLaUnidad.filter((e) => e.anillo > 0).length;
      if (estructura.exteriores !== exterioresEsperados || estructura.huecos !== huecosEsperados) {
        errores.push(
          `${etapa}: el Departamento ${codigo} (${unidad.nombre}) tiene ${estructura.exteriores} anillo(s) exterior(es) y ${estructura.huecos} hueco(s), ` +
            `y debe tener ${exterioresEsperados} y ${huecosEsperados}.`,
        );
      }
    }
  }
  return errores.length > 0 ? fallo(errores) : ok(undefined);
}

/** SHA-256 (hexadecimal) del texto UTF-8 `JSON.stringify(anillo)`. Es la huella de coordenadas de las excepciones. */
export function huellaDeAnillo(anillo: Anillo): string {
  return createHash('sha256').update(JSON.stringify(anillo), 'utf8').digest('hex');
}

type Objeto = Record<string, unknown>;
const esObjeto = (valor: unknown): valor is Objeto => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/**
 * Comprueba las excepciones registradas en `partesNoRepresentables` de fuente.config.json y devuelve las que se aplicarán.
 * Una excepción solo vale si: (1) es EXACTAMENTE una de las autorizadas en el código, (2) está aprobada por el Equipo en el
 * registro, (3) en la fuente sin simplificar existe ese anillo con la misma huella de coordenadas y el mismo número de
 * puntos, y (4) con los parámetros aprobados esa parte de verdad no se puede dibujar a un decimal. Si algo no coincide, es un error:
 * una excepción no puede servir para ocultar un cambio de la fuente ni una parte que sí se puede dibujar.
 */
export function verificarExcepciones(
  registradas: unknown,
  autorizadas: readonly ExcepcionAutorizada[],
  original: readonly UnidadCruda[],
  parametros: ParametrosMapa,
): Resultado<ExcepcionActiva[]> {
  if (registradas === undefined) return ok([]);
  if (!Array.isArray(registradas)) return fallo('fuente.config.json: "partesNoRepresentables" debe ser una lista.');
  const proyectar = crearProyector(parametros.proyeccion);
  const errores: string[] = [];
  const activas: ExcepcionActiva[] = [];
  const vistas = new Set<string>();
  for (const [i, crudo] of (registradas as unknown[]).entries()) {
    const etiqueta = `partesNoRepresentables[${i}]`;
    if (!esObjeto(crudo)) {
      errores.push(`${etiqueta}: debe ser un objeto.`);
      continue;
    }
    const { id, codigo, poligono, anillo, puntos, sha256, motivo, aprobadoPorEquipo } = crudo;
    const autorizada = autorizadas.find(
      (a) => a.id === id && a.codigo === codigo && a.poligono === poligono && a.anillo === anillo && a.sha256 === sha256,
    );
    if (autorizada === undefined) {
      errores.push(
        `${etiqueta} (${JSON.stringify(id)}): no es una de las excepciones que el Equipo autorizó (${autorizadas.map((a) => a.id).join(', ') || 'ninguna'}) ` +
          'o su código, polígono, anillo o huella no coinciden con la autorización.',
      );
      continue;
    }
    if (vistas.has(autorizada.id)) {
      errores.push(`${etiqueta}: la excepción ${autorizada.id} está repetida.`);
      continue;
    }
    vistas.add(autorizada.id);
    if (aprobadoPorEquipo !== true) {
      errores.push(`${etiqueta} (${autorizada.id}): "aprobadoPorEquipo" no es true.`);
      continue;
    }
    if (typeof motivo !== 'string' || motivo.trim() === '') {
      errores.push(`${etiqueta} (${autorizada.id}): falta el motivo.`);
      continue;
    }
    const unidad = original.find((u) => u.codigo === autorizada.codigo);
    const anilloOriginal = unidad?.poligonos[autorizada.poligono]?.[autorizada.anillo];
    if (anilloOriginal === undefined) {
      errores.push(`${etiqueta} (${autorizada.id}): la fuente sin simplificar no tiene ese anillo.`);
      continue;
    }
    const huella = huellaDeAnillo(anilloOriginal);
    if (huella !== autorizada.sha256) {
      errores.push(
        `${etiqueta} (${autorizada.id}): las coordenadas de la fuente cambiaron. La huella SHA-256 es ${huella} y la autorizada es ${autorizada.sha256}.`,
      );
      continue;
    }
    if (puntos !== anilloOriginal.length) {
      errores.push(`${etiqueta} (${autorizada.id}): el registro dice ${JSON.stringify(puntos)} puntos y el anillo de la fuente tiene ${anilloOriginal.length}.`);
      continue;
    }
    const redondeado = redondearAnillo(anilloOriginal, proyectar);
    if (motivoInvalido(redondeado) === undefined) {
      errores.push(
        `${etiqueta} (${autorizada.id}): con los parámetros del mapa esta parte sí se puede dibujar a un decimal. La excepción ya no corresponde y debe retirarse.`,
      );
      continue;
    }
    activas.push({ id: autorizada.id, codigo: autorizada.codigo, anillo: autorizada.anillo, puntos: new Set(anilloOriginal.map(clavePunto)) });
  }
  return errores.length > 0 ? fallo(errores) : ok(activas);
}
/**
 * Proyecta las unidades y construye la Geometría. Falla —sin descartar nada— si una parte no se puede dibujar a un
 * decimal (salvo una excepción autorizada y comprobada), si un punto queda fuera del viewBox, si un centroide no se puede
 * calcular o si una ruta escrita no dice exactamente lo que se quiso dibujar.
 */
export function construirGeometria(
  unidades: readonly UnidadCruda[],
  tabla: readonly FilaTabla[],
  parametros: ParametrosMapa,
  campos: { fuente: string; licencia: string },
  opciones: OpcionesConstruccion = {},
): Resultado<{ geometria: Geometria; resumen: Resumen }> {
  const tolerante = opciones.tolerante === true;
  const excepciones = opciones.excepciones ?? [];
  let partesOmitidas = 0;
  const partesExcepcion: string[] = [];
  const proyectar = crearProyector(parametros.proyeccion);
  const [minX, minY, ancho, alto] = parametros.viewBox;
  const nombres = new Map(tabla.map((fila) => [fila.codigo, fila.nombre]));
  const errores: string[] = [];
  const departamentos: DepartamentoGeometria[] = [];
  let partes = 0;
  let puntosEntrada = 0;
  let verticesSalida = 0;

  // Se construye en el orden de la tabla de la tarea 1.4 (01 a 25), no en el de la fuente.
  const porCodigo = new Map(unidades.map((u) => [u.codigo, u]));
  for (const fila of tabla) {
    const unidad = porCodigo.get(fila.codigo);
    if (unidad === undefined) continue;
    const etiqueta = `Departamento ${unidad.codigo} (${fila.nombre})`;
    const poligonos = redondearPoligonos(unidad.poligonos, proyectar);
    puntosEntrada += contarPuntos(unidad.poligonos);

    const dibujadas: AnilloDecimas[] = [];
    // Para el centroide: las partes que no se dibujan (excepción) no cuentan.
    const paraCentroide: (AnilloDecimas | undefined)[][] = [];
    for (const [ip, poligono] of poligonos.entries()) {
      const delCentroide: (AnilloDecimas | undefined)[] = [];
      paraCentroide.push(delCentroide);
      for (const [ir, anillo] of poligono.entries()) {
        const original = (unidad.poligonos[ip] as UnidadCruda['poligonos'][number])[ir] as Anillo;
        const motivo = motivoInvalido(anillo);
        const excepcion = excepcionDe(original, unidad.codigo, excepciones);
        if (excepcion !== undefined) {
          if (motivo === undefined) {
            errores.push(
              `${etiqueta}, polígono ${ip}, ${ir === 0 ? 'anillo exterior' : `hueco ${ir}`}: la parte ${excepcion.id} tiene una excepción, ` +
                'pero con estos parámetros sí se puede dibujar. La excepción ya no corresponde.',
            );
          } else {
            partesExcepcion.push(excepcion.id);
          }
          delCentroide.push(undefined);
          continue;
        }
        delCentroide.push(anillo);
        if (motivo !== undefined) {
          if (tolerante) {
            partesOmitidas++;
          } else {
            errores.push(
              `${etiqueta}, polígono ${ip}, ${ir === 0 ? 'anillo exterior' : `hueco ${ir}`}: ${motivo}. ` +
                'No se descarta: hay que decidir cómo representar esta parte.',
            );
          }
          continue;
        }
        for (const [xd, yd] of anillo) {
          const x = xd / 10;
          const y = yd / 10;
          if (x < minX || x > minX + ancho || y < minY || y > minY + alto) {
            errores.push(`${etiqueta}: el punto proyectado (${textoDecimas(xd)}, ${textoDecimas(yd)}) queda fuera del viewBox.`);
          }
        }
        dibujadas.push(anillo);
        verticesSalida += anillo.length;
        partes++;
      }
    }

    const ruta = rutaRelativa(dibujadas);
    // La ruta escrita se relee y debe decir exactamente lo mismo que los anillos redondeados.
    const releida = anillosDeRutaRelativa(ruta);
    if (releida === undefined || JSON.stringify(releida) !== JSON.stringify(dibujadas)) {
      errores.push(`${etiqueta}: la ruta relativa escrita no coincide con los anillos redondeados.`);
    }

    const centro = centroideDecimas(paraCentroide);
    if (centro === undefined) {
      errores.push(`${etiqueta}: no se pudo calcular el centroide (el área de las partes válidas no es positiva).`);
      continue;
    }
    departamentos.push({
      codigo: unidad.codigo as CodigoDepartamento,
      nombre: nombres.get(unidad.codigo) ?? fila.nombre,
      d: ruta,
      centroide: [centro[0] / 10, centro[1] / 10],
    });
  }

  if (errores.length > 0) return fallo(errores);

  const geometria: Geometria = {
    version: parametros.version,
    fuente: campos.fuente,
    licencia: campos.licencia,
    viewBox: [...parametros.viewBox] as [number, number, number, number],
    departamentos,
  };
  return ok({
    geometria,
    resumen: { departamentos: departamentos.length, partes, puntosEntrada, verticesSalida, partesOmitidas, partesExcepcion },
  });
}
/** Número de decimales con los que se escribe una coordenada del texto de una ruta (para comprobar la precisión). */
export function decimalesMaximos(rutas: string): number {
  let maximo = 0;
  for (const numero of rutas.match(/-?\d*\.?\d+/g) ?? []) {
    maximo = Math.max(maximo, (numero.split('.')[1] ?? '').length);
  }
  return maximo;
}

export { DECIMALES_COORDENADAS };
