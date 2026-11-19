// Simplificación con Mapshaper y búsqueda del grado de simplificación.
//
// La spec no fija un porcentaje de simplificación: el diseño lo define por el resultado ("simplifica con
// mapshaper conservando topología hasta que el archivo comprimido quede por debajo de 80 KB"). El Equipo fijó además
// el método (tarea 3.2): `-explode` antes de simplificar y Douglas-Peucker. Por eso no hay un porcentaje fijo en el
// código: `buscarSimplificacion` busca el mayor porcentaje de vértices que se conservan con el que el archivo cumple el
// tamaño pedido.
import { CODIFICACION_DBF } from './constantes.ts';
import { fallo, ok, type Resultado } from './result.ts';

const NOMBRE_ENTRADA = 'fuente.zip';
const NOMBRE_SALIDA = 'salida.json';

/**
 * Lee el ZIP de la fuente con Mapshaper y devuelve una FeatureCollection de GeoJSON. `porcentaje` es el % de vértices
 * removibles que se conservan.
 *
 * - Con 100 no se toca la geometría: es la fuente tal como está, con un registro por departamento. Es la referencia con la
 *   que se comprueba todo lo demás.
 * - Con menos de 100: `-explode` reparte cada parte (isla, polígono o hueco con su exterior) en su propio registro y
 *   después `-simplify dp … keep-shapes` aplica Douglas-Peucker. `keep-shapes` solo protege el anillo mayor de cada
 *   registro; sin `-explode` las islas y los huecos de un departamento multiparte no estarían protegidos y se perderían.
 *   Los registros resultantes se vuelven a agrupar por código (ver `normalizarFeatures`, opción `agrupar`).
 *
 * `-simplify` conserva la topología (las fronteras compartidas se simplifican una sola vez, sin dejar huecos ni solapes).
 */
export async function simplificarFuente(zip: Uint8Array, porcentaje: number): Promise<Resultado<unknown>> {
  if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
    return fallo(`El porcentaje de simplificación debe estar entre 0 (sin incluir) y 100, y es ${porcentaje}.`);
  }
  const simplificar = porcentaje >= 100 ? '' : `-explode -simplify dp ${Number(porcentaje.toPrecision(8))}% keep-shapes `;
  try {
    // Mapshaper tarda en cargarse: se importa aquí y no al arrancar, para que las ejecuciones que la puerta rechaza
    // (fuente sin confirmar o parámetros sin aprobar) no lo paguen.
    const { default: mapshaper } = await import('mapshaper');
    const salida = await mapshaper.applyCommands(
      `-i ${NOMBRE_ENTRADA} encoding=${CODIFICACION_DBF} ${simplificar}-o format=geojson ${NOMBRE_SALIDA}`,
      { [NOMBRE_ENTRADA]: zip },
    );
    const crudo = salida[NOMBRE_SALIDA];
    if (crudo === undefined) return fallo('Mapshaper no devolvió ningún resultado.');
    const texto = typeof crudo === 'string' ? crudo : new TextDecoder('utf-8').decode(crudo);
    return ok(JSON.parse(texto) as unknown);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return fallo(`Mapshaper no pudo leer o simplificar la fuente: ${detalle}`);
  }
}

/** Lo mínimo que la búsqueda necesita saber de cada intento. */
export interface Evaluacion {
  porcentaje: number;
  comprimidoBytes: number;
}

export interface OpcionesBusqueda<E extends Evaluacion> {
  /** Evalúa un porcentaje de vértices conservados. Un fallo detiene la búsqueda. */
  evaluar: (porcentaje: number) => Promise<Resultado<E>>;
  /** Tamaño comprimido máximo que se busca. */
  objetivoBytes: number;
  /** Porcentaje más bajo que se prueba. */
  porcentajeMinimo: number;
  /** Número de pasos de la bisección. */
  iteraciones: number;
  /**
   * Primer porcentaje que se prueba dentro de la bisección, si queda dentro del intervalo. Es solo el punto de arranque:
   * no se elige si no cumple, y el resultado puede ser mayor o menor.
   */
  inicial?: number;
}

export interface ResultadoBusqueda<E extends Evaluacion> {
  /** El mayor porcentaje probado cuyo tamaño comprimido cumple el objetivo. */
  elegido: E;
  /** Todos los intentos, en el orden en que se evaluaron. */
  intentos: E[];
}

/**
 * Busca el MAYOR porcentaje de vértices conservados (la menor simplificación) con el que el tamaño comprimido
 * es igual o menor que el objetivo. Supone que el tamaño crece con el porcentaje; el resultado se comprueba
 * con una evaluación real, no se estima. Bisección en escala logarítmica entre `porcentajeMinimo` y 100; si se indica
 * `inicial`, el primer paso prueba ese valor en lugar del punto medio.
 */
export async function buscarSimplificacion<E extends Evaluacion>(
  opciones: OpcionesBusqueda<E>,
): Promise<Resultado<ResultadoBusqueda<E>>> {
  const { evaluar, objetivoBytes, porcentajeMinimo, iteraciones, inicial } = opciones;
  const intentos: E[] = [];
  const probar = async (porcentaje: number): Promise<Resultado<E>> => {
    const r = await evaluar(porcentaje);
    if (r.ok) intentos.push(r.valor);
    return r;
  };

  // Sin simplificar: si ya cumple, no se toca la geometría.
  const completa = await probar(100);
  if (!completa.ok) return completa;
  if (completa.valor.comprimidoBytes <= objetivoBytes) return ok({ elegido: completa.valor, intentos });

  // Con la máxima simplificación permitida: si ni así cumple, no hay solución dentro de la búsqueda.
  const minima = await probar(porcentajeMinimo);
  if (!minima.ok) return minima;
  if (minima.valor.comprimidoBytes > objetivoBytes) {
    return fallo(
      `Ni con la mayor simplificación probada (${porcentajeMinimo}% de los vértices) el archivo comprimido baja de ` +
        `${objetivoBytes} bytes: pesa ${minima.valor.comprimidoBytes} bytes.`,
    );
  }

  let bueno = minima.valor; // cumple el objetivo
  let bajo = porcentajeMinimo;
  let alto = 100; // no cumple el objetivo
  for (let i = 0; i < iteraciones; i++) {
    const arranque = i === 0 && inicial !== undefined && inicial > bajo && inicial < alto;
    const medio = arranque ? inicial : Math.sqrt(bajo * alto);
    const r = await probar(medio);
    if (!r.ok) return r;
    if (r.valor.comprimidoBytes <= objetivoBytes) {
      bueno = r.valor;
      bajo = medio;
    } else {
      alto = medio;
    }
  }
  return ok({ elegido: bueno, intentos });
}
