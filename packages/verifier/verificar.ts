// Verificador determinista de resúmenes (tarea 10.1). Requisitos 11.3, 12.1, 12.2, 12.3, 12.4 y 12.9.
//
// `verificar(aviso, resumen)` compara los Datos_Críticos del resumen con los del aviso y comprueba que el resumen conserve todas las
// recomendaciones. Es una función pura y determinista: no usa red ni modelos de lenguaje y solo lee el reloj por la dependencia `ahora`.
//
// Resultado:
// - `aprobado`: todo dato crítico que el extractor reconoce en el resumen está en el aviso (con el mismo valor, la misma unidad y el
//   mismo signo) y cada recomendación del aviso tiene una de sus frases en el resumen, sin una negación conocida delante.
// - `rechazado`: algún dato se añadió, se modificó o falta una recomendación. El motivo empieza por `añadido:<tipo>`,
//   `modificado:<tipo>` u `omision:recomendacion`, seguido del detalle.
// - `no_verificado`: no se pudo comprobar. Pasa con entradas inválidas, textos más largos que los topes, recomendaciones sin frases, un
//   aviso con instrucciones pero sin recomendaciones declaradas, un error o la superación del plazo. Ante la duda no se aprueba.
//
// LÍMITES CONOCIDOS. Aprobar significa "no se detectó ningún cambio", no "no hay ningún cambio". No se detectan:
// - lugares fuera del catálogo de los 25 Departamentos (provincias, distritos, localidades, países) ni otros nombres propios;
// - niveles escritos fuera de un contexto reconocido ("nivel", "alerta"…) o con palabras que no están en el vocabulario;
// - números escritos de una forma que el extractor no reconoce, ni "un", "una" y "uno" fuera de una unidad;
// - instrucciones añadidas por el resumen. Solo se comprueba que estén las recomendaciones del aviso y que ninguna esté negada con una
//   negación conocida cerca; no se comprueba que el resumen no añada otras;
// - cambios de significado que no tocan ningún dato crítico (por ejemplo, el sentido de una frase sin cifras ni lugares);
// - expresiones relativas ("hoy", "mañana") usadas con otro sentido que en el aviso: se comparan como texto, no como fecha.
//
// PLAZO. El límite de 5 s (Requisito 12.1) se controla de forma cooperativa: se lee el reloj entre las fases de la extracción y de la
// comparación, y si pasó el plazo se devuelve `no_verificado`. Esto NO interrumpe un código síncrono que se quede bloqueado dentro de
// una sola operación. Por eso las entradas están acotadas (20 000 caracteres el aviso y 2 000 el resumen) y las expresiones regulares
// no tienen retroceso catastrófico. Un cierre forzoso (por ejemplo con `worker_threads`) corresponde al orquestador (tarea 10.4).
import type { AvisoOficial } from '@teletexto/modelo';
import {
  claveDe,
  contieneMarcadoresDeInstruccion,
  extraerCriticosControlado,
  normalizarTexto,
  type DatoCritico,
  type TipoDato,
} from './criticos.ts';
import { acotarMotivo, type ResultadoVerificacion } from './registro.ts';

/** Plazo máximo de la verificación, en milisegundos (Requisito 12.1). */
export const PLAZO_VERIFICACION_MS = 5000;
/** Longitud máxima del texto del aviso que se verifica. Mayor que el límite de 20 KB del JSON público de alertas. */
export const MAX_CARACTERES_AVISO = 20_000;
/** Longitud máxima del resumen que se verifica. Un resumen de 60 palabras cabe con mucho margen. */
export const MAX_CARACTERES_RESUMEN = 2_000;

/** Lo único que el verificador lee de un aviso. Un `AvisoOficial` completo también sirve. */
export type AvisoVerificable = Pick<AvisoOficial, 'textoOriginal' | 'recomendaciones'>;

/** Dependencias inyectables. `ahora` da milisegundos; `plazoMs` solo puede reducir el plazo de 5 s. */
export interface DependenciasVerificacion {
  readonly ahora?: () => number;
  readonly plazoMs?: number;
}

/** Motivo de un rechazo: `añadido:<tipo>`, `modificado:<tipo>` u `omision:recomendacion`, con el detalle. Máximo 500 caracteres. */
export type MotivoRechazo = string;

class PlazoAgotado extends Error {}
class RelojInvalido extends Error {}

function relojDelSistema(): number {
  return Date.now();
}

function leer(ahora: () => number): number {
  let valor: unknown;
  try {
    valor = ahora();
  } catch {
    throw new RelojInvalido();
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new RelojInvalido();
  return valor;
}

function plazoEfectivo(plazoMs: unknown): number {
  return typeof plazoMs === 'number' && Number.isFinite(plazoMs) && plazoMs > 0 ? Math.min(plazoMs, PLAZO_VERIFICACION_MS) : PLAZO_VERIFICACION_MS;
}

function noVerificado(motivo: string): ResultadoVerificacion {
  return Object.freeze({ estado: 'no_verificado', motivo: acotarMotivo(motivo) });
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** Motivo por el que las entradas no se pueden verificar, o `undefined` si son válidas. */
function motivoDeEntradaInvalida(aviso: unknown, resumen: unknown): string | undefined {
  if (!esObjeto(aviso)) return 'aviso inválido: no es un objeto';
  const texto = aviso['textoOriginal'];
  if (typeof texto !== 'string' || texto.trim() === '') return 'aviso inválido: falta el texto original';
  if (texto.length > MAX_CARACTERES_AVISO) return `el texto del aviso supera los ${MAX_CARACTERES_AVISO} caracteres`;
  if (typeof resumen !== 'string' || resumen.trim() === '') return 'resumen inválido: debe ser texto y no estar vacío';
  if (resumen.length > MAX_CARACTERES_RESUMEN) return `el resumen supera los ${MAX_CARACTERES_RESUMEN} caracteres`;
  const recomendaciones = aviso['recomendaciones'];
  if (!Array.isArray(recomendaciones)) return 'aviso inválido: las recomendaciones no son una lista';
  for (const recomendacion of recomendaciones as unknown[]) {
    if (!esObjeto(recomendacion) || typeof recomendacion['clave'] !== 'string') return 'aviso inválido: una recomendación no tiene clave';
    const frases = recomendacion['frases'];
    const utilizables =
      Array.isArray(frases) && frases.length > 0 && (frases as unknown[]).every((f) => typeof f === 'string' && normalizarTexto(f) !== '');
    if (!utilizables) return `la recomendación ${JSON.stringify(recomendacion['clave'])} no tiene frases utilizables`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Fechas parciales: se comparan solo los componentes escritos. Nunca se completa un componente ausente.

interface Componentes {
  readonly a?: string;
  readonly m?: string;
  readonly d?: string;
}

function componentesDe(valor: string): Componentes | undefined {
  let c = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (c) return { a: c[1] ?? '', m: c[2] ?? '', d: c[3] ?? '' };
  c = /^(\d{4})-(\d{2})$/.exec(valor);
  if (c) return { a: c[1] ?? '', m: c[2] ?? '' };
  c = /^--(\d{2})-(\d{2})$/.exec(valor);
  if (c) return { m: c[1] ?? '', d: c[2] ?? '' };
  c = /^--(\d{2})$/.exec(valor);
  if (c) return { m: c[1] ?? '' };
  return undefined;
}

const CLAVES_COMPONENTE = ['a', 'm', 'd'] as const;

/** Cada componente escrito en `resumen` está escrito y es igual en `aviso`. */
function estaContenida(resumen: Componentes, aviso: Componentes): boolean {
  return CLAVES_COMPONENTE.every((k) => resumen[k] === undefined || resumen[k] === aviso[k]);
}

/** Alguno de los componentes escritos en los dos es igual. */
function comparten(resumen: Componentes, aviso: Componentes): boolean {
  return CLAVES_COMPONENTE.some((k) => resumen[k] !== undefined && resumen[k] === aviso[k]);
}

const esRelativa = (valor: string): boolean => valor.startsWith('relativa:');
const sinSigno = (valor: string): string => valor.replace(/^[+-]/, '');

// ---------------------------------------------------------------------------------------------------------------------------------
// Comparación de datos

function descripcion(dato: DatoCritico): string {
  return dato.tipo === 'cifra' && dato.unidad !== undefined ? `${dato.valor} ${dato.unidad}` : dato.valor;
}

function hallazgo(clase: 'añadido' | 'modificado', tipo: TipoDato, dato: DatoCritico): string {
  return `${clase}:${tipo} ${JSON.stringify(descripcion(dato))}`;
}

/** Hallazgos de datos del resumen que no están en el aviso. Cada uno es un rechazo; la clase solo cambia el motivo. */
function compararDatos(datosAviso: readonly DatoCritico[], datosResumen: readonly DatoCritico[]): string[] {
  const clavesAviso = new Set(datosAviso.map(claveDe));
  const fechasAviso = datosAviso
    .filter((d) => d.tipo === 'fecha' && !esRelativa(d.valor))
    .map((d) => componentesDe(d.valor))
    .filter((c): c is Componentes => c !== undefined);
  const cifrasAviso = datosAviso.filter((d): d is Extract<DatoCritico, { tipo: 'cifra' }> => d.tipo === 'cifra');
  const hallazgos: string[] = [];

  for (const dato of datosResumen) {
    if (dato.tipo === 'fecha' && !esRelativa(dato.valor)) {
      const c = componentesDe(dato.valor);
      if (c === undefined) {
        hallazgos.push(hallazgo('añadido', 'fecha', dato)); // No debería ocurrir: ante la duda, se rechaza.
      } else if (!fechasAviso.some((a) => estaContenida(c, a))) {
        hallazgos.push(hallazgo(fechasAviso.some((a) => comparten(c, a)) ? 'modificado' : 'añadido', 'fecha', dato));
      }
      continue;
    }
    if (clavesAviso.has(claveDe(dato))) continue;
    if (dato.tipo === 'cifra') {
      // Mismo contexto: la misma unidad, o el mismo número aunque cambie el signo o la unidad. Solo decide si el motivo dice
      // "modificado" o "añadido": en los dos casos el resumen se rechaza.
      const mismaUnidad = cifrasAviso.some((c) => (c.unidad ?? '') === (dato.unidad ?? ''));
      const mismoValor = cifrasAviso.some((c) => sinSigno(c.valor) === sinSigno(dato.valor));
      hallazgos.push(hallazgo(mismaUnidad || mismoValor ? 'modificado' : 'añadido', 'cifra', dato));
    } else {
      hallazgos.push(hallazgo('añadido', dato.tipo, dato));
    }
  }
  return hallazgos;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Recomendaciones

/** Palabras de negación conocidas. La lista es cerrada: no detecta todas las formas de negar o de contradecir una instrucción. */
const NEGACIONES: ReadonlySet<string> = new Set([
  'no', 'nunca', 'jamás', 'jamas', 'tampoco', 'ni', 'sin', 'evite', 'eviten', 'evita', 'evitar', 'evitemos', 'deje', 'dejen', 'deja', 'dejar',
  'omita', 'omitir',
]);
const VENTANA_NEGACION = 3;
const LIMITES_DE_ORACION = new Set(['.', '!', '?', ';', ':', '¡', '¿']);
const LETRA_O_NUMERO = /[\p{L}\p{N}]/u;

function esLetraONumero(caracter: string | undefined): boolean {
  return caracter !== undefined && caracter !== '' && LETRA_O_NUMERO.test(caracter);
}

/** Posiciones donde `frase` aparece en `texto` como palabras completas. */
function ocurrencias(texto: string, frase: string): number[] {
  const posiciones: number[] = [];
  let desde = 0;
  for (;;) {
    const i = texto.indexOf(frase, desde);
    if (i === -1) return posiciones;
    const antes = i === 0 ? undefined : texto[i - 1];
    const despues = texto[i + frase.length];
    if (!esLetraONumero(antes) && !esLetraONumero(despues)) posiciones.push(i);
    desde = i + 1;
  }
}

/** `true` si una negación conocida está entre las tres palabras anteriores a la frase, dentro de la misma oración. */
function estaNegada(texto: string, indice: number): boolean {
  const antes = texto.slice(0, indice);
  let inicio = 0;
  for (let i = antes.length - 1; i >= 0; i--) {
    if (LIMITES_DE_ORACION.has(antes[i] ?? '')) {
      inicio = i + 1;
      break;
    }
  }
  const palabras = antes.slice(inicio).split(/[^\p{L}\p{N}]+/u).filter((p) => p !== '');
  return palabras.slice(-VENTANA_NEGACION).some((p) => NEGACIONES.has(p));
}

type EstadoRecomendacion = 'presente' | 'negada' | 'omitida';

function evaluarRecomendacion(textoResumen: string, frases: readonly string[]): EstadoRecomendacion {
  let negada = false;
  for (const frase of frases) {
    for (const posicion of ocurrencias(textoResumen, normalizarTexto(frase))) {
      if (!estaNegada(textoResumen, posicion)) return 'presente';
      negada = true;
    }
  }
  return negada ? 'negada' : 'omitida';
}

// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Verifica un resumen frente a su aviso. Ver la cabecera del archivo para el significado de cada estado y los límites conocidos. Si no
 * se pasa `ahora`, usa el reloj del sistema solo para medir el plazo.
 */
export function verificar(aviso: AvisoVerificable, resumen: string, dependencias?: DependenciasVerificacion): ResultadoVerificacion {
  const deps: DependenciasVerificacion = esObjeto(dependencias) ? dependencias : {};
  const ahora = typeof deps.ahora === 'function' ? deps.ahora : relojDelSistema;
  const plazo = plazoEfectivo(deps.plazoMs);
  let inicio: number;
  try {
    inicio = leer(ahora);
  } catch {
    return noVerificado('reloj no válido');
  }
  const controlar = (): void => {
    if (leer(ahora) - inicio > plazo) throw new PlazoAgotado();
  };

  try {
    const invalida = motivoDeEntradaInvalida(aviso, resumen);
    if (invalida !== undefined) return noVerificado(invalida);
    controlar();

    const datosAviso = extraerCriticosControlado(aviso.textoOriginal, controlar);
    const datosResumen = extraerCriticosControlado(resumen, controlar);
    const hallazgos = compararDatos(datosAviso, datosResumen);
    controlar();

    const textoResumen = normalizarTexto(resumen);
    for (const recomendacion of aviso.recomendaciones) {
      controlar();
      const estado = evaluarRecomendacion(textoResumen, recomendacion.frases);
      if (estado !== 'presente') {
        hallazgos.push(`omision:recomendacion ${JSON.stringify(recomendacion.clave)}${estado === 'negada' ? ' (negada)' : ''}`);
      }
    }
    if (hallazgos.length > 0) {
      controlar();
      return Object.freeze({ estado: 'rechazado', motivo: acotarMotivo(hallazgos.join('; ')) });
    }
    if (aviso.recomendaciones.length === 0 && contieneMarcadoresDeInstruccion(aviso.textoOriginal)) {
      return noVerificado('el aviso contiene instrucciones, pero no declara recomendaciones: no se puede comprobar que el resumen las conserve');
    }
    controlar();
    return Object.freeze({ estado: 'aprobado' });
  } catch (error) {
    if (error instanceof PlazoAgotado) return noVerificado(`tiempo agotado: la verificación superó el plazo de ${plazo} ms`);
    if (error instanceof RelojInvalido) return noVerificado('reloj no válido');
    return noVerificado('error interno al verificar');
  }
}
